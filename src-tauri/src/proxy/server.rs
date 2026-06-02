use std::sync::Arc;
use tokio::net::TcpListener;
use super::balancer::Balancer;
use super::router::create_router;

use std::sync::atomic::Ordering;

pub async fn start_proxy_server(port: u16, db: Arc<crate::database::DbManager>, balancer: Arc<Balancer>, proxy_running: Arc<std::sync::atomic::AtomicBool>, app_handle: tauri::AppHandle) {

    // Setup mpsc channel for usage stats
    let (usage_tx, mut usage_rx) = tokio::sync::mpsc::unbounded_channel::<crate::database::UsageStatMessage>();

    let consumer_db = db.clone();
    tokio::spawn(async move {
        let mut batch = Vec::with_capacity(50);
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));
        
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    if !batch.is_empty() {
                        let batch_to_insert = std::mem::replace(&mut batch, Vec::with_capacity(50));
                        let db_for_blocking = consumer_db.clone();
                        tokio::task::spawn_blocking(move || {
                            let _ = db_for_blocking.batch_insert_usage_stats(batch_to_insert);
                        });
                    }
                }
                msg = usage_rx.recv() => {
                    match msg {
                        Some(m) => {
                            batch.push(m);
                            if batch.len() >= 50 {
                                let batch_to_insert = std::mem::replace(&mut batch, Vec::with_capacity(50));
                                let db_for_blocking = consumer_db.clone();
                                tokio::task::spawn_blocking(move || {
                                    let _ = db_for_blocking.batch_insert_usage_stats(batch_to_insert);
                                });
                                interval.reset(); // Reset the timer since we just flushed
                            }
                        }
                        None => {
                            // Channel closed, flush any remaining items
                            if !batch.is_empty() {
                                let batch_to_insert = std::mem::replace(&mut batch, Vec::with_capacity(50));
                                let db_for_blocking = consumer_db.clone();
                                tokio::task::spawn_blocking(move || {
                                    let _ = db_for_blocking.batch_insert_usage_stats(batch_to_insert);
                                });
                            }
                            break;
                        }
                    }
                }
            }
        }
    });

    // Setup router
    let app = create_router(balancer, db.clone(), usage_tx, app_handle);

    // Bind to the given port
    let addr = format!("127.0.0.1:{port}");
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            proxy_running.store(true, Ordering::SeqCst);
            l
        },
        Err(e) => {
            eprintln!("Failed to bind to port {port}: {e}");
            proxy_running.store(false, Ordering::SeqCst);
            return;
        }
    };

    println!("OmniGate Proxy Server listening on {addr}");

    // Run the server
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("Server error: {e}");
    }
}
