use axum::{
    extract::State,
    http::{Method, Request, Response, StatusCode, HeaderMap, HeaderValue},
    body::Body,
    response::IntoResponse,
};
use std::sync::Arc;
use super::router::AppState;
use futures_util::TryStreamExt;
use std::time::Duration;
use std::time::Instant;
use tauri::Emitter;

// ============================================================================
// Helper types and functions
// ============================================================================

#[derive(serde::Deserialize)]
pub struct Fake200Keyword {
    word: String,
    #[serde(rename = "matchType")]
    match_type: String,
}

pub fn is_fake_200_error_with_keywords(text: &str, keywords: &[Fake200Keyword]) -> bool {
    for kw in keywords {
        if kw.word.trim().is_empty() { continue; }
        if kw.match_type == "exact" && text.trim() == kw.word.trim() {
            return true;
        } else if kw.match_type == "contains" && text.contains(&kw.word) {
            return true;
        }
    }
    false
}

/// 加载一次 fake_200 关键词（每个请函只调用一次）
pub fn load_fake_200_keywords(db: &crate::database::DbManager) -> Vec<Fake200Keyword> {
    let keywords_json = db.get_global_setting("fake_200_keywords", "[]");
    serde_json::from_str::<Vec<Fake200Keyword>>(&keywords_json).unwrap_or_default()
}


fn record_usage(
    state: &Arc<AppState>,
    provider_id: &str,
    provider_name: &str,
    model_name: &str,
    request_path: &str,
    status_code: u16,
    latency_ms: u32,
    error_message: Option<String>,
) {
    let _ = state.usage_tx.send(crate::database::UsageStatMessage {
        provider_id: provider_id.to_string(),
        model_name: model_name.to_string(),
        request_path: request_path.to_string(),
        status_code,
        latency_ms,
        error_message: error_message.clone(),
        created_at: chrono::Utc::now().timestamp(),
    });

    if let Some(msg) = error_message {
        let payload = serde_json::json!({
            "provider_id": provider_id,
            "provider_name": provider_name,
            "model_name": model_name,
            "status_code": status_code,
            "error_message": msg,
            "time": chrono::Local::now().format("%H:%M:%S").to_string()
        });
        let _ = state.app_handle.emit("provider-error", payload);
    }
}


fn build_json_error(status: StatusCode, code: &str, message: &str) -> axum::response::Response {
    let json_body = serde_json::json!({
        "error": {
            "message": message,
            "type": "omnigate_proxy_error",
            "param": serde_json::Value::Null,
            "code": code
        }
    });
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .body(Body::from(json_body.to_string()))
        .unwrap()
        .into_response()
}

fn get_effective_plan(state: &Arc<AppState>, client_id: &str, headers: &HeaderMap) -> Option<crate::proxy::balancer::RoutingPlan> {
    if let Some(test_provider_id) = headers.get("x-omnigate-test-provider") {
        if let Ok(id_str) = test_provider_id.to_str() {
            if let Ok(providers) = state.db.get_all_providers() {
                if let Some(p) = providers.into_iter().find(|p| p.id == id_str) {
                    let proxy_provider = crate::proxy::models::ProxyProvider {
                        id: p.id,
                        name: p.name,
                        api_url: p.api_url,
                        api_key: p.api_key,
                        protocol: p.protocol,
                        billing_type: p.billing_type,
                        reset_time: p.reset_time,
                        weight: 1,
                        sort_order: 1,
                    };
                    return Some(crate::proxy::balancer::RoutingPlan { providers: vec![proxy_provider] });
                }
            }
        }
    }
    state.balancer.get_routing_plan(client_id)
}

// ============================================================================
// Transparent Proxy Core
// ============================================================================

/// 路径映射策略
enum PathMode {
    /// 固定 /messages 路径（Claude 协议端点）
    Messages,
    /// 根据供应商 protocol 映射 /responses：claude → /messages，其他 → /responses。
    /// 其余路径透传（去掉 /v1 前缀）。
    ResponsesAware,
    /// 透传：仅去掉 /v1 前缀
    PassThrough,
}

/// 每个 handler 的差异化配置
struct ProxyConfig {
    client_id: &'static str,
    path_mode: PathMode,
    /// 是否启用模型匹配（仅 handle_claude_messages 需要）
    enable_model_matching: bool,
    /// 为 true 时始终使用 Bearer 认证（如 OpenCode Chat）
    bearer_only: bool,
}

/// 根据 PathMode 和供应商 protocol 计算上游路径
fn compute_upstream_path(path: &str, mode: &PathMode, protocol: &str) -> String {
    match mode {
        PathMode::Messages => "/messages".to_string(),
        PathMode::ResponsesAware => {
            if path == "/responses" || path == "/v1/responses" {
                if protocol == "claude" { "/messages".to_string() } else { "/responses".to_string() }
            } else if path.starts_with("/v1/") {
                path.strip_prefix("/v1").unwrap_or(path).to_string()
            } else {
                path.to_string()
            }
        }
        PathMode::PassThrough => {
            if path.starts_with("/v1/") {
                path.strip_prefix("/v1").unwrap_or(path).to_string()
            } else {
                path.to_string()
            }
        }
    }
}

/// 核心透明代理转发函数。
/// 仅修改：URL 路由、API Key 认证头、模型名称（启用模型匹配时）。
/// 所有其他请求/响应的 header 和 body 原样透传。
async fn transparent_forward(
    state: Arc<AppState>,
    method: Method,
    path: String,
    query: String,
    headers: HeaderMap,
    body_bytes: axum::body::Bytes,
    config: ProxyConfig,
) -> axum::response::Response {
    // 从 body 提取模型名称（用于日志和模型匹配）
    let model_name = if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
        json.get("model").and_then(|m| m.as_str()).unwrap_or("unknown").to_string()
    } else {
        "unknown".to_string()
    };

    let req_path = format!("/{}{}", config.client_id, &path);

    // 获取路由计划
    let plan = match get_effective_plan(&state, config.client_id, &headers) {
        Some(p) => p,
        None => return build_json_error(
            StatusCode::BAD_REQUEST,
            "no_active_providers",
            &format!("[OmniGate] 当前客户端 ({}) 未配置任何可用的供应商。请在 OmniGate 控制面板中添加并启用至少一个供应商。", config.client_id),
        ),
    };

    let fake_200_kws = load_fake_200_keywords(&state.db);
    let global_max_retries: i32 = state.db.get_global_setting("max_retries", "2").parse().unwrap_or(2);
    let global_max_retry_timeout: u64 = state.db.get_global_setting("max_retry_timeout", "120").parse().unwrap_or(120);
    let global_request_timeout: u64 = state.db.get_global_setting("request_timeout", "120").parse().unwrap_or(120);
    let max_attempts = if global_max_retries == -1 { usize::MAX } else { global_max_retries as usize + 1 };
    let mut last_error = String::new();
    let mut all_providers_skipped = true;

    for provider in plan.providers.iter() {
        // --- 模型匹配（仅 enable_model_matching 时执行） ---
        let (upstream_model_name, provider_body_bytes) = if config.enable_model_matching {
            let mut final_model_name = None;
            if let Ok(models) = state.db.get_models_by_provider(&provider.id) {
                if models.is_empty() {
                    // 若该供应商尚未拉取任何模型，默认放行（向下兼容）
                    final_model_name = Some(model_name.clone());
                } else {
                    // 检查是否有全局默认模型
                    for m in &models {
                        if !m.is_active { continue; }
                        if m.is_mapped_default {
                            final_model_name = Some(m.name.clone());
                            break;
                        }
                    }
                    // 如果没有全局默认模型，走名字精确匹配和别名匹配
                    if final_model_name.is_none() {
                        for m in &models {
                            if !m.is_active { continue; }
                            if m.name == model_name {
                                final_model_name = Some(m.name.clone());
                                break;
                            }
                            if let Some(mapping) = &m.mapping {
                                if mapping.split(',').map(|s| s.trim()).any(|s| s == model_name) {
                                    final_model_name = Some(m.name.clone());
                                    break;
                                }
                            }
                        }
                    }
                }
            } else {
                final_model_name = Some(model_name.clone());
            }

            match final_model_name {
                Some(name) => {
                    let mut pbody = body_bytes.clone();
                    // 模型名发生映射时，修改请求体中的 model 字段
                    if name != model_name {
                        if let Ok(mut json) = serde_json::from_slice::<serde_json::Value>(&pbody) {
                            if let Some(obj) = json.as_object_mut() {
                                obj.insert("model".to_string(), serde_json::Value::String(name.clone()));
                                if let Ok(new_bytes) = serde_json::to_vec(&json) {
                                    pbody = axum::body::Bytes::from(new_bytes);
                                }
                            }
                        }
                    }
                    (name, pbody)
                }
                None => {
                    last_error = format!("模型未匹配 (供应商 {} 不支持 {})", provider.name, model_name);
                    continue; // 跳过当前供应商
                }
            }
        } else {
            (model_name.clone(), body_bytes.clone())
        };

        all_providers_skipped = false;

        // --- 构建上游 URL ---
        let mut base_url = provider.api_url.trim_end_matches('/').to_string();
        let has_version = {
            let parts: Vec<&str> = base_url.split('/').collect();
            if let Some(last) = parts.last() {
                last.starts_with('v') && last.len() > 1 && last[1..].chars().all(|c| c.is_ascii_digit())
            } else {
                false
            }
        };
        if !has_version {
            base_url = format!("{base_url}/v1");
        }
        let mapped_path = compute_upstream_path(&path, &config.path_mode, &provider.protocol);
        let upstream_url = format!("{base_url}{mapped_path}{query}");

        // --- 透明 header 转发：仅移除 hop-by-hop 头 ---
        let mut req_headers = headers.clone();
        req_headers.remove("host");              // reqwest 会根据 URL 自动设置
        req_headers.remove("connection");        // hop-by-hop
        req_headers.remove("transfer-encoding"); // hop-by-hop，reqwest 自行管理
        req_headers.remove("content-length");    // reqwest 从 body 自动计算
        // 注意：accept-encoding 保留（透明代理）

        // --- 认证 header 替换（最小修改） ---
        let safe_key = provider.api_key.trim();
        if !config.bearer_only && provider.protocol == "claude" {
            if let Ok(val) = HeaderValue::from_str(safe_key) {
                req_headers.insert("x-api-key", val);
                if !req_headers.contains_key("anthropic-version") {
                    req_headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
                }
            }
        } else if let Ok(auth_val) = HeaderValue::from_str(&format!("Bearer {safe_key}")) {
            req_headers.insert("authorization", auth_val);
        }

        let _ = state.app_handle.emit("routing_active", serde_json::json!({
            "client_id": config.client_id,
            "provider_id": provider.id,
        }));

        // --- 针对同一个供应商重试 max_attempts 次 ---
        for attempt in 0..max_attempts {
            if attempt > 0 {
                let wait_secs = std::cmp::min(2.0_f64.powi(attempt as i32 - 1) as u64, global_max_retry_timeout);
                tokio::time::sleep(Duration::from_secs(wait_secs)).await;
            }

            let req = state.http_client.request(method.clone(), &upstream_url)
                .headers(req_headers.clone())
                .body(provider_body_bytes.clone());
            let start_time = Instant::now();

            let res_result = tokio::time::timeout(
                Duration::from_secs(global_request_timeout),
                req.send(),
            ).await;

            match res_result {
                Ok(Ok(res)) => {
                    let status = res.status();

                    // 5xx / 429：可重试，继续重试同一供应商
                    if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
                        let body_text = res.text().await.unwrap_or_else(|_| "无法读取上游错误体".to_string());
                        last_error = format!("HTTP {status} - {body_text}");
                        let latency = start_time.elapsed().as_millis() as u32;
                        record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, status.as_u16(), latency, Some(last_error.clone()));
                        continue;
                    }

                    // 4xx：不重试，直接切下一个供应商
                    if status.is_client_error() {
                        let body_text = res.text().await.unwrap_or_else(|_| "无法读取上游错误体".to_string());
                        last_error = format!("HTTP {status} - {body_text}");
                        let latency = start_time.elapsed().as_millis() as u32;
                        record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, status.as_u16(), latency, Some(last_error.clone()));
                        break;
                    }

                    // 成功：窥探前几个字节做 fake_200 检测，然后流式透传
                    let mut res = res;
                    let mut initial_buf: Vec<u8> = Vec::new();
                    let mut chunks_read = 0usize;
                    let mut read_err = false;
                    while chunks_read < 5 && initial_buf.len() < 16 * 1024 {
                        match res.chunk().await {
                            Ok(Some(chunk)) => {
                                initial_buf.extend_from_slice(&chunk);
                                chunks_read += 1;
                                if !initial_buf.is_empty() { break; }
                            }
                            Ok(None) => break,
                            Err(e) => {
                                last_error = format!("读取上游流失败: {e}");
                                let latency = start_time.elapsed().as_millis() as u32;
                                record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, 502, latency, Some(last_error.clone()));
                                read_err = true;
                                break;
                            }
                        }
                    }
                    if read_err { continue; }

                    let first_chunk = axum::body::Bytes::from(initial_buf);
                    let first_chunk_str = String::from_utf8_lossy(&first_chunk);
                    if is_fake_200_error_with_keywords(&first_chunk_str, &fake_200_kws) {
                        last_error = format!("伪装错误(被风控/断连): {}", first_chunk_str.chars().take(200).collect::<String>());
                        let latency = start_time.elapsed().as_millis() as u32;
                        record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, 502, latency, Some(last_error.clone()));
                        break;
                    }

                    // --- 透明响应：仅去掉 hop-by-hop 头 ---
                    let mut response_builder = Response::builder().status(status);
                    for (k, v) in res.headers().iter() {
                        let k_str = k.as_str().to_lowercase();
                        // 仅移除 hop-by-hop 头，保留 content-encoding 等（透明代理）
                        if k_str != "transfer-encoding" && k_str != "connection" && k_str != "content-length" {
                            response_builder = response_builder.header(k, v);
                        }
                    }

                    let latency = start_time.elapsed().as_millis() as u32;
                    state.balancer.record_success(&provider.id);
                    record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, status.as_u16(), latency, None);

                    let rest_stream = res.bytes_stream().map_err(std::io::Error::other);
                    use futures_util::StreamExt;
                    let first_chunk_stream = futures_util::stream::once(async move {
                        Ok::<_, std::io::Error>(first_chunk)
                    });
                    let combined_stream = first_chunk_stream.chain(rest_stream);
                    let body = Body::from_stream(combined_stream);
                    return response_builder.body(body).unwrap();
                }
                Ok(Err(e)) => {
                    last_error = format!("Reqwest error: {e}");
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, 502, latency, Some(last_error.clone()));
                    continue;
                }
                Err(e) => {
                    last_error = format!("Timeout: {e}");
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, 504, latency, Some(last_error.clone()));
                    continue;
                }
            }
        }
        // 该供应商所有次数耗尽，记录惩罚，继续下一个供应商
        state.balancer.record_failure(&provider.id, &state.app_handle);
    }

    // 所有供应商耗尽
    if config.enable_model_matching && all_providers_skipped {
        return build_json_error(
            StatusCode::BAD_REQUEST,
            "invalid_request_error",
            &format!("[OmniGate] 请求被拒绝：您请求的模型 `{model_name}` 未在当前配置的任何供应商中启用，也没有匹配的映射别名。请前往 OmniGate 控制台检查\u{201c}模型信息\u{201d}或配置\u{201c}模型映射\u{201d}。"),
        );
    }

    if last_error.is_empty() {
        build_json_error(StatusCode::BAD_GATEWAY, "upstream_error", "[OmniGate] 所有上游供应商均请求失败。")
    } else {
        build_json_error(StatusCode::BAD_GATEWAY, "upstream_error", &format!("[OmniGate] 上游请求失败: {last_error}"))
    }
}

// ============================================================================
// Handler functions — 薄包装，仅提取路由参数后调用 transparent_forward
// ============================================================================

/// Claude 客户端（/claude/v1/messages）
pub async fn handle_claude_messages(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Body,
) -> Result<impl IntoResponse, StatusCode> {
    let body_bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Ok(build_json_error(StatusCode::BAD_REQUEST, "invalid_request", "[OmniGate] 无法解析传入的请求体数据。")),
    };
    Ok(transparent_forward(
        state, Method::POST,
        "/messages".to_string(), String::new(),
        headers, body_bytes,
        ProxyConfig { client_id: "claude", path_mode: PathMode::Messages, enable_model_matching: true, bearer_only: false },
    ).await)
}

/// OpenCode — Claude 协议（/opencode/claude/v1/messages → opencode-claude）
pub async fn handle_opencode_claude(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Body,
) -> Result<impl IntoResponse, StatusCode> {
    let body_bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Ok(build_json_error(StatusCode::BAD_REQUEST, "invalid_request", "[OmniGate] 无法解析传入的请求体数据。")),
    };
    Ok(transparent_forward(
        state, Method::POST,
        "/messages".to_string(), String::new(),
        headers, body_bytes,
        ProxyConfig { client_id: "opencode-claude", path_mode: PathMode::Messages, enable_model_matching: false, bearer_only: false },
    ).await)
}

/// OpenCode — Responses 协议（/opencode/responses/* → opencode-resp）
pub async fn handle_opencode_resp(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request<Body>,
) -> Result<impl IntoResponse, StatusCode> {
    let path = request.uri().path()
        .strip_prefix("/opencode/responses").unwrap_or(request.uri().path()).to_string();
    let query = request.uri().query().map(|q| format!("?{q}")).unwrap_or_default();
    let method = request.method().clone();
    let body_bytes = match axum::body::to_bytes(request.into_body(), usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Ok(build_json_error(StatusCode::BAD_REQUEST, "invalid_request", "[OmniGate] 无法解析传入的请求体数据。")),
    };
    Ok(transparent_forward(
        state, method,
        path, query,
        headers, body_bytes,
        ProxyConfig { client_id: "opencode-resp", path_mode: PathMode::ResponsesAware, enable_model_matching: false, bearer_only: false },
    ).await)
}

/// OpenCode — Chat 协议（/opencode/chat/* → opencode-chat）
pub async fn handle_opencode_chat(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request<Body>,
) -> Result<impl IntoResponse, StatusCode> {
    let path = request.uri().path()
        .strip_prefix("/opencode/chat").unwrap_or(request.uri().path()).to_string();
    let query = request.uri().query().map(|q| format!("?{q}")).unwrap_or_default();
    let method = request.method().clone();
    let body_bytes = match axum::body::to_bytes(request.into_body(), usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Ok(build_json_error(StatusCode::BAD_REQUEST, "invalid_request", "[OmniGate] 无法解析传入的请求体数据。")),
    };
    Ok(transparent_forward(
        state, method,
        path, query,
        headers, body_bytes,
        ProxyConfig { client_id: "opencode-chat", path_mode: PathMode::PassThrough, enable_model_matching: false, bearer_only: true },
    ).await)
}

/// Codex 客户端（/codex/* → codex）
pub async fn handle_codex_proxy(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request<Body>,
) -> Result<impl IntoResponse, StatusCode> {
    let path = request.uri().path()
        .strip_prefix("/codex").unwrap_or(request.uri().path()).to_string();
    let query = request.uri().query().map(|q| format!("?{q}")).unwrap_or_default();
    let method = request.method().clone();
    let body_bytes = match axum::body::to_bytes(request.into_body(), usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Ok(build_json_error(StatusCode::BAD_REQUEST, "invalid_request", "[OmniGate] 无法解析传入的请求体数据。")),
    };
    Ok(transparent_forward(
        state, method,
        path, query,
        headers, body_bytes,
        ProxyConfig { client_id: "codex", path_mode: PathMode::ResponsesAware, enable_model_matching: false, bearer_only: false },
    ).await)
}

pub async fn handle_fallback(
    request: Request<Body>,
) -> impl IntoResponse {
    (StatusCode::NOT_FOUND, format!("No route found for {}", request.uri().path()))
}
