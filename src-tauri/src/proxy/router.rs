use axum::{
    routing::{post, get},
    Router,
};
use std::sync::Arc;
use super::balancer::Balancer;
use super::handlers;

pub struct AppState {
    pub balancer: Arc<Balancer>,
    pub http_client: reqwest::Client,
}

pub fn create_router(balancer: Arc<Balancer>) -> Router {
    let http_client = reqwest::Client::new();
    
    let state = Arc::new(AppState {
        balancer,
        http_client,
    });

    Router::new()
        // Example routes for Claude API
        .route("/claude/v1/messages", post(handlers::handle_claude_messages))
        // Example routes for OpenCode/OpenAI compatible API
        .route("/opencode/v1/chat/completions", post(handlers::handle_opencode_chat))
        // Codex interception route
        .route("/codex/*path", axum::routing::any(handlers::handle_codex_proxy))
        // We can add a fallback or catch-all for testing
        .fallback(handlers::handle_fallback)
        .with_state(state)
}
