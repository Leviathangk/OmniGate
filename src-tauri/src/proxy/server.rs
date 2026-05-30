use std::sync::Arc;
use tokio::net::TcpListener;
use super::balancer::Balancer;
use super::router::create_router;

use std::sync::atomic::Ordering;

pub async fn start_proxy_server(port: u16, db: Arc<crate::database::DbManager>, proxy_running: Arc<std::sync::atomic::AtomicBool>) {
    // Initialize our load balancer strategy
    let balancer = Arc::new(Balancer::new(db));

    // Setup router
    let app = create_router(balancer);

    // Bind to the given port
    let addr = format!("127.0.0.1:{}", port);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            proxy_running.store(true, Ordering::SeqCst);
            l
        },
        Err(e) => {
            eprintln!("Failed to bind to port {}: {}", port, e);
            proxy_running.store(false, Ordering::SeqCst);
            return;
        }
    };

    println!("OmniGate Proxy Server listening on {}", addr);

    // Run the server
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("Server error: {}", e);
    }
}
