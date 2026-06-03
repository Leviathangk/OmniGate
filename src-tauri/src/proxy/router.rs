use axum::{routing::post, Router};
use tower_http::cors::{Any, CorsLayer};
use std::sync::Arc;
use super::balancer::Balancer;
use super::handlers;

pub struct AppState {
    pub balancer: Arc<Balancer>,
    pub http_client: reqwest::Client,
    pub db: Arc<crate::database::DbManager>,
    pub usage_tx: tokio::sync::mpsc::UnboundedSender<crate::database::UsageStatMessage>,
    pub app_handle: tauri::AppHandle,
}

pub fn create_router(
    balancer: Arc<Balancer>,
    db: Arc<crate::database::DbManager>,
    usage_tx: tokio::sync::mpsc::UnboundedSender<crate::database::UsageStatMessage>,
    app_handle: tauri::AppHandle,
) -> Router {
    let http_client = reqwest::Client::new();

    let state = Arc::new(AppState {
        balancer,
        http_client,
        db,
        usage_tx,
        app_handle,
    });

    axum::Router::new()
        // ── Claude 客户端 ────────────────────────────────────────────────────
        .route("/claude/v1/messages", post(handlers::handle_claude_messages))

        // ── OpenCode 客户端（3 条独立路由，3 个独立路由计划）────────────────
        // Claude 协议：omnigate-claude → @ai-sdk/anthropic
        .route("/opencode/claude/v1/messages", post(handlers::handle_opencode_claude))
        // Responses 协议：omnigate-resp → @ai-sdk/openai
        .route("/opencode/responses/*path", axum::routing::any(handlers::handle_opencode_resp))
        // Chat 协议：omnigate-chat → @ai-sdk/openai-compatible
        .route("/opencode/chat/*path", axum::routing::any(handlers::handle_opencode_chat))

        // ── Codex 客户端 ─────────────────────────────────────────────────────
        .route("/codex/*path", axum::routing::any(handlers::handle_codex_proxy))

        // Fallback
        .fallback(handlers::handle_fallback)
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any)
        )
}
