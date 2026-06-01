use axum::{
    extract::State,
    http::{Request, Response, StatusCode, HeaderMap, HeaderValue},
    body::Body,
    response::IntoResponse,
};
use std::sync::Arc;
use super::router::AppState;
use futures_util::TryStreamExt;
use std::time::Duration;
use std::time::Instant;
use tauri::Emitter;

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

pub async fn handle_claude_messages(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Body,
) -> Result<impl IntoResponse, StatusCode> {
    let body_bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Ok(build_json_error(StatusCode::BAD_REQUEST, "invalid_request", "[OmniGate] 无法解析传入的请求体数据。").into_response()),
    };

    let model_name = if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
        json.get("model").and_then(|m| m.as_str()).unwrap_or("unknown").to_string()
    } else {
        "unknown".to_string()
    };
    
    let req_path = "/messages".to_string();

    let plan = match state.balancer.get_routing_plan("claude") {
        Some(p) => p,
        None => return Ok(build_json_error(StatusCode::BAD_REQUEST, "no_active_providers", "[OmniGate] 当前客户端未配置任何可用的供应商。请在 OmniGate 控制板中添加并启用至少一个供应商。").into_response()),
    };
    
    // 修复问题1：每个供应商独立重试 retry_count+1 次，耗尽后再换下一个供应商
    let max_attempts = plan.retry_count as usize + 1;
    let mut last_error = String::new();
    let mut all_providers_skipped = true;

    for provider in plan.providers.iter() {
        // --- 检查模型是否匹配（原生支持 或 映射支持） ---
        let mut final_model_name = None;
        if let Ok(models) = state.db.get_models_by_provider(&provider.id) {
            if models.is_empty() {
                // 若该供应商尚未拉取任何模型，默认放行（向下兼容）
                final_model_name = Some(model_name.clone());
            } else {
                for m in &models {
                    if !m.is_active { continue; }
                    // 如果该模型被设为全局默认，则无视请求的模型名称，直接全量接管
                    if m.is_mapped_default {
                        final_model_name = Some(m.name.clone());
                        break;
                    }
                }
                
                // 如果没有全局默认模型，再走名字精确匹配和别名匹配
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

        let upstream_model_name = match final_model_name {
            Some(name) => name,
            None => {
                last_error = format!("模型未匹配 (供应商 {} 不支持 {})", provider.name, model_name);
                continue; // 没匹配上，直接跳过当前供应商，尝试下一个
            }
        };

        all_providers_skipped = false;

        // --- 应用模型映射 (如果名称改变，则修改请求体) ---
        let mut provider_body_bytes = body_bytes.clone();
        if upstream_model_name != model_name {
            if let Ok(mut json) = serde_json::from_slice::<serde_json::Value>(&provider_body_bytes) {
                if let Some(obj) = json.as_object_mut() {
                    obj.insert("model".to_string(), serde_json::Value::String(upstream_model_name.clone()));
                    if let Ok(new_bytes) = serde_json::to_vec(&json) {
                        provider_body_bytes = axum::body::Bytes::from(new_bytes);
                    }
                }
            }
        }

        // --- 构建 URL 和 Headers（每个供应商只做一次）---
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
            base_url = format!("{}/v1", base_url);
        }
        let upstream_url = format!("{}/messages", base_url);

        let mut req_headers = headers.clone();
        req_headers.remove("host");
        req_headers.remove("transfer-encoding");
        req_headers.remove("content-length");
        req_headers.remove("connection");
        req_headers.remove("accept-encoding");

        let safe_key = provider.api_key.trim();
        if let Ok(val) = HeaderValue::from_str(safe_key) {
            if provider.protocol == "claude" {
                req_headers.insert("x-api-key", val);
                if !req_headers.contains_key("anthropic-version") {
                    req_headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
                }
            } else {
                if let Ok(auth_val) = HeaderValue::from_str(&format!("Bearer {}", safe_key)) {
                    req_headers.insert("authorization", auth_val);
                }
            }
        }

        // --- 针对同一个供应商重试 max_attempts 次 ---
        for _attempt in 0..max_attempts {
            let req = state.http_client.post(&upstream_url)
                .headers(req_headers.clone())
                .body(provider_body_bytes.clone());
            let start_time = Instant::now();

            let res_result = tokio::time::timeout(
                Duration::from_secs(plan.timeout_seconds as u64),
                req.send()
            ).await;

            match res_result {
                Ok(Ok(res)) => {
                    let status = res.status();
                    if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
                        // 可重试错误：继续重试同一供应商
                        let body_text = res.text().await.unwrap_or_else(|_| "无法读取上游错误体".to_string());
                        last_error = format!("HTTP {} - {}", status, body_text);
                        let latency = start_time.elapsed().as_millis() as u32;
                        record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, status.as_u16(), latency, Some(last_error.clone()));
                        continue; // 重试同一供应商
                    }

                    // 成功：直接透传流式响应
                    let mut response_builder = Response::builder().status(status);
                    for (k, v) in res.headers().iter() {
                        let k_str = k.as_str().to_lowercase();
                        if k_str != "transfer-encoding" && k_str != "content-encoding" && k_str != "content-length" && k_str != "connection" {
                            response_builder = response_builder.header(k, v);
                        }
                    }
                    let latency = start_time.elapsed().as_millis() as u32;
                    state.balancer.record_success(&provider.id);
                    record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, status.as_u16(), latency, None);
                    let stream = res.bytes_stream().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
                    let body = Body::from_stream(stream);
                    return Ok(response_builder.body(body).unwrap());
                }
                Ok(Err(e)) => {
                    last_error = format!("Reqwest error: {}", e);
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, 502, latency, Some(last_error.clone()));
                    continue; // 重试同一供应商
                }
                Err(e) => {
                    last_error = format!("Timeout: {}", e);
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &upstream_model_name, &req_path, 504, latency, Some(last_error.clone()));
                    continue; // 重试同一供应商
                }
            }
        }
        // 该供应商所有次数耗尽，继续下一个供应商
    }

    let (status_code, error_type, msg) = if all_providers_skipped {
        (
            StatusCode::BAD_REQUEST,
            "invalid_request_error",
            format!("[OmniGate] 请求被拒绝：您请求的模型 `{}` 未在当前配置的任何供应商中启用，也没有匹配的映射别名。请前往 OmniGate 控制台检查“模型信息”或配置“模型映射”。", model_name)
        )
    } else if last_error.is_empty() {
        (
            StatusCode::BAD_GATEWAY,
            "upstream_error",
            "[OmniGate] 所有上游供应商均请求失败。".to_string()
        )
    } else {
        (
            StatusCode::BAD_GATEWAY,
            "upstream_error",
            format!("[OmniGate] 上游请求失败: {}", last_error)
        )
    };
    Ok(build_json_error(status_code, error_type, &msg).into_response())
}

// ============================================================================
// OpenCode — Claude 协议 (/opencode/claude/v1/messages → opencode-claude)
// ============================================================================

pub async fn handle_opencode_claude(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Body,
) -> Result<impl IntoResponse, StatusCode> {
    let body_bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Ok(build_json_error(StatusCode::BAD_REQUEST, "invalid_request", "[OmniGate] 无法解析传入的请求体数据。").into_response()),
    };

    let model_name = if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
        json.get("model").and_then(|m| m.as_str()).unwrap_or("unknown").to_string()
    } else {
        "unknown".to_string()
    };

    let req_path = "/messages".to_string();

    let plan = match state.balancer.get_routing_plan("opencode-claude") {
        Some(p) => p,
        None => return Ok(build_json_error(StatusCode::BAD_REQUEST, "no_active_providers",
            "[OmniGate] OpenCode Claude 分组未配置任何可用的供应商。请在 OmniGate → 客户端配置 → OpenCode → Claude 协议中添加并启用供应商。").into_response()),
    };

    let max_attempts = plan.retry_count as usize + 1;
    let mut last_error = String::new();

    for provider in plan.providers.iter() {
        let mut base_url = provider.api_url.trim_end_matches('/').to_string();
        let has_version = {
            let parts: Vec<&str> = base_url.split('/').collect();
            if let Some(last) = parts.last() {
                last.starts_with('v') && last.len() > 1 && last[1..].chars().all(|c| c.is_ascii_digit())
            } else { false }
        };
        if !has_version { base_url = format!("{}/v1", base_url); }
        let upstream_url = format!("{}/messages", base_url);

        let mut req_headers = headers.clone();
        req_headers.remove("host");
        req_headers.remove("transfer-encoding");
        req_headers.remove("content-length");
        req_headers.remove("connection");
        req_headers.remove("accept-encoding");

        let safe_key = provider.api_key.trim();
        if let Ok(val) = HeaderValue::from_str(safe_key) {
            if provider.protocol == "claude" {
                req_headers.insert("x-api-key", val);
                if !req_headers.contains_key("anthropic-version") {
                    req_headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
                }
            } else {
                if let Ok(auth_val) = HeaderValue::from_str(&format!("Bearer {}", safe_key)) {
                    req_headers.insert("authorization", auth_val);
                }
            }
        }

        for _attempt in 0..max_attempts {
            let req = state.http_client.post(&upstream_url)
                .headers(req_headers.clone())
                .body(body_bytes.clone());
            let start_time = Instant::now();
            let res_result = tokio::time::timeout(Duration::from_secs(plan.timeout_seconds as u64), req.send()).await;
            match res_result {
                Ok(Ok(res)) => {
                    let status = res.status();
                    if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
                        let body_text = res.text().await.unwrap_or_default();
                        last_error = format!("HTTP {} - {}", status, body_text);
                        let latency = start_time.elapsed().as_millis() as u32;
                        record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, status.as_u16(), latency, Some(last_error.clone()));
                        continue;
                    }
                    let mut rb = Response::builder().status(status);
                    for (k, v) in res.headers().iter() {
                        let ks = k.as_str().to_lowercase();
                        if ks != "transfer-encoding" && ks != "content-encoding" && ks != "content-length" && ks != "connection" {
                            rb = rb.header(k, v);
                        }
                    }
                    let latency = start_time.elapsed().as_millis() as u32;
                    state.balancer.record_success(&provider.id);
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, status.as_u16(), latency, None);
                    let stream = res.bytes_stream().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
                    return Ok(rb.body(Body::from_stream(stream)).unwrap());
                }
                Ok(Err(e)) => {
                    last_error = format!("Reqwest error: {}", e);
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, 502, latency, Some(last_error.clone()));
                    continue;
                }
                Err(e) => {
                    last_error = format!("Timeout: {}", e);
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, 504, latency, Some(last_error.clone()));
                    continue;
                }
            }
        }
        state.balancer.record_failure(&provider.id);
    }

    let msg = if last_error.is_empty() { "[OmniGate] 所有上游供应商均请求失败。".to_string() }
              else { format!("[OmniGate] 上游请求失败: {}", last_error) };
    Ok(build_json_error(StatusCode::BAD_GATEWAY, "upstream_error", &msg).into_response())
}

// ============================================================================
// OpenCode — Responses 协议 (/opencode/responses/* → opencode-resp)
// ============================================================================

pub async fn handle_opencode_resp(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request<Body>,
) -> Result<impl IntoResponse, StatusCode> {
    let path = request.uri().path()
        .strip_prefix("/opencode/responses").unwrap_or(request.uri().path()).to_string();
    let query = request.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();
    let method = request.method().clone();
    let body_bytes = match axum::body::to_bytes(request.into_body(), usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Ok(build_json_error(StatusCode::BAD_REQUEST, "invalid_request", "[OmniGate] 无法解析传入的请求体数据。").into_response()),
    };

    let model_name = if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
        json.get("model").and_then(|m| m.as_str()).unwrap_or("unknown").to_string()
    } else { "unknown".to_string() };

    let req_path = path.clone();
    let plan = match state.balancer.get_routing_plan("opencode-resp") {
        Some(p) => p,
        None => return Ok(build_json_error(StatusCode::BAD_REQUEST, "no_active_providers",
            "[OmniGate] OpenCode Responses 分组未配置任何可用的供应商。请在 OmniGate → 客户端配置 → OpenCode → Responses 协议中添加并启用供应商。").into_response()),
    };

    let max_attempts = plan.retry_count as usize + 1;
    let mut last_error = String::new();

    for provider in plan.providers.iter() {
        let mut base_url = provider.api_url.trim_end_matches('/').to_string();
        let has_version = {
            let parts: Vec<&str> = base_url.split('/').collect();
            if let Some(last) = parts.last() {
                last.starts_with('v') && last.len() > 1 && last[1..].chars().all(|c| c.is_ascii_digit())
            } else { false }
        };
        if !has_version { base_url = format!("{}/v1", base_url); }

        // Responses 协议路径映射（同 codex_proxy 逻辑）
        let mapped_path = if path == "/responses" || path == "/v1/responses" {
            if provider.protocol == "claude" { "/messages".to_string() } else { "/responses".to_string() }
        } else {
            if path.starts_with("/v1/") { path.strip_prefix("/v1").unwrap_or(&path).to_string() } else { path.clone() }
        };

        let upstream_url = format!("{}{}{}", base_url, mapped_path, query);

        let mut req_headers = headers.clone();
        req_headers.remove("host");
        req_headers.remove("transfer-encoding");
        req_headers.remove("content-length");
        req_headers.remove("connection");
        req_headers.remove("accept-encoding");

        let safe_key = provider.api_key.trim();
        if let Ok(val) = HeaderValue::from_str(safe_key) {
            if provider.protocol == "claude" {
                req_headers.insert("x-api-key", val);
                if !req_headers.contains_key("anthropic-version") {
                    req_headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
                }
            } else {
                if let Ok(auth_val) = HeaderValue::from_str(&format!("Bearer {}", safe_key)) {
                    req_headers.insert("authorization", auth_val);
                }
            }
        }

        for _attempt in 0..max_attempts {
            let req = state.http_client.request(method.clone(), &upstream_url)
                .headers(req_headers.clone())
                .body(body_bytes.clone());
            let start_time = Instant::now();
            let res_result = tokio::time::timeout(Duration::from_secs(plan.timeout_seconds as u64), req.send()).await;
            match res_result {
                Ok(Ok(res)) => {
                    let status = res.status();
                    if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
                        let body_text = res.text().await.unwrap_or_default();
                        last_error = format!("HTTP {} - {}", status, body_text);
                        let latency = start_time.elapsed().as_millis() as u32;
                        record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, status.as_u16(), latency, Some(last_error.clone()));
                        continue;
                    }
                    let mut rb = Response::builder().status(status);
                    for (k, v) in res.headers().iter() {
                        let ks = k.as_str().to_lowercase();
                        if ks != "transfer-encoding" && ks != "content-encoding" && ks != "content-length" && ks != "connection" {
                            rb = rb.header(k, v);
                        }
                    }
                    let latency = start_time.elapsed().as_millis() as u32;
                    state.balancer.record_success(&provider.id);
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, status.as_u16(), latency, None);
                    let stream = res.bytes_stream().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
                    return Ok(rb.body(Body::from_stream(stream)).unwrap());
                }
                Ok(Err(e)) => {
                    last_error = format!("Reqwest error: {}", e);
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, 502, latency, Some(last_error.clone()));
                    continue;
                }
                Err(e) => {
                    last_error = format!("Timeout: {}", e);
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, 504, latency, Some(last_error.clone()));
                    continue;
                }
            }
        }
        state.balancer.record_failure(&provider.id);
    }

    let msg = if last_error.is_empty() { "[OmniGate] 所有上游供应商均请求失败。".to_string() }
              else { format!("[OmniGate] 上游请求失败: {}", last_error) };
    Ok(build_json_error(StatusCode::BAD_GATEWAY, "upstream_error", &msg).into_response())
}

// ============================================================================
// OpenCode — Chat 协议 (/opencode/chat/* → opencode-chat)
// ============================================================================

pub async fn handle_opencode_chat(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request<Body>,
) -> Result<impl IntoResponse, StatusCode> {
    let path = request.uri().path()
        .strip_prefix("/opencode/chat").unwrap_or(request.uri().path()).to_string();
    let query = request.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();
    let method = request.method().clone();
    let body_bytes = match axum::body::to_bytes(request.into_body(), usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Ok(build_json_error(StatusCode::BAD_REQUEST, "invalid_request", "[OmniGate] 无法解析传入的请求体数据。").into_response()),
    };

    let model_name = if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
        json.get("model").and_then(|m| m.as_str()).unwrap_or("unknown").to_string()
    } else { "unknown".to_string() };

    let req_path = path.clone();
    let plan = match state.balancer.get_routing_plan("opencode-chat") {
        Some(p) => p,
        None => return Ok(build_json_error(StatusCode::BAD_REQUEST, "no_active_providers",
            "[OmniGate] OpenCode Chat 分组未配置任何可用的供应商。请在 OmniGate → 客户端配置 → OpenCode → Chat 协议中添加并启用供应商。").into_response()),
    };

    let max_attempts = plan.retry_count as usize + 1;
    let mut last_error = String::new();

    for provider in plan.providers.iter() {
        let mut base_url = provider.api_url.trim_end_matches('/').to_string();
        let has_version = {
            let parts: Vec<&str> = base_url.split('/').collect();
            if let Some(last) = parts.last() {
                last.starts_with('v') && last.len() > 1 && last[1..].chars().all(|c| c.is_ascii_digit())
            } else { false }
        };
        if !has_version { base_url = format!("{}/v1", base_url); }

        // Chat 协议路径透传
        let mapped_path = if path.starts_with("/v1/") {
            path.strip_prefix("/v1").unwrap_or(&path).to_string()
        } else { path.clone() };
        let upstream_url = format!("{}{}{}", base_url, mapped_path, query);

        let mut req_headers = headers.clone();
        req_headers.remove("host");
        req_headers.remove("transfer-encoding");
        req_headers.remove("content-length");
        req_headers.remove("connection");
        req_headers.remove("accept-encoding");

        let safe_key = provider.api_key.trim();
        if let Ok(auth_val) = HeaderValue::from_str(&format!("Bearer {}", safe_key)) {
            req_headers.insert("authorization", auth_val);
        }

        for _attempt in 0..max_attempts {
            let req = state.http_client.request(method.clone(), &upstream_url)
                .headers(req_headers.clone())
                .body(body_bytes.clone());
            let start_time = Instant::now();
            let res_result = tokio::time::timeout(Duration::from_secs(plan.timeout_seconds as u64), req.send()).await;
            match res_result {
                Ok(Ok(res)) => {
                    let status = res.status();
                    if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
                        let body_text = res.text().await.unwrap_or_default();
                        last_error = format!("HTTP {} - {}", status, body_text);
                        let latency = start_time.elapsed().as_millis() as u32;
                        record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, status.as_u16(), latency, Some(last_error.clone()));
                        continue;
                    }
                    let mut rb = Response::builder().status(status);
                    for (k, v) in res.headers().iter() {
                        let ks = k.as_str().to_lowercase();
                        if ks != "transfer-encoding" && ks != "content-encoding" && ks != "content-length" && ks != "connection" {
                            rb = rb.header(k, v);
                        }
                    }
                    let latency = start_time.elapsed().as_millis() as u32;
                    state.balancer.record_success(&provider.id);
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, status.as_u16(), latency, None);
                    let stream = res.bytes_stream().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
                    return Ok(rb.body(Body::from_stream(stream)).unwrap());
                }
                Ok(Err(e)) => {
                    last_error = format!("Reqwest error: {}", e);
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, 502, latency, Some(last_error.clone()));
                    continue;
                }
                Err(e) => {
                    last_error = format!("Timeout: {}", e);
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, 504, latency, Some(last_error.clone()));
                    continue;
                }
            }
        }
        state.balancer.record_failure(&provider.id);
    }

    let msg = if last_error.is_empty() { "[OmniGate] 所有上游供应商均请求失败。".to_string() }
              else { format!("[OmniGate] 上游请求失败: {}", last_error) };
    Ok(build_json_error(StatusCode::BAD_GATEWAY, "upstream_error", &msg).into_response())
}



pub async fn handle_codex_proxy(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request<Body>,
) -> Result<impl IntoResponse, StatusCode> {
    let path = request.uri().path().strip_prefix("/codex").unwrap_or(request.uri().path()).to_string();
    let query = request.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();
    let method = request.method().clone();
    let body_bytes = match axum::body::to_bytes(request.into_body(), usize::MAX).await {
        Ok(b) => b,
        Err(_) => return Ok(build_json_error(StatusCode::BAD_REQUEST, "invalid_request", "[OmniGate] 无法解析传入的请求体数据。").into_response()),
    };

    let model_name = if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
        json.get("model").and_then(|m| m.as_str()).unwrap_or("unknown").to_string()
    } else {
        "unknown".to_string()
    };

    let req_path = path.clone();
    let plan = match state.balancer.get_routing_plan("codex") {
        Some(p) => p,
        None => return Ok(build_json_error(StatusCode::BAD_REQUEST, "no_active_providers", "[OmniGate] 当前客户端未配置任何可用的供应商。请在 OmniGate 控制板中添加并启用至少一个供应商。").into_response()),
    };

    // 修复问题1：每个供应商独立重试 retry_count+1 次
    let max_attempts = plan.retry_count as usize + 1;
    let mut last_error = String::new();

    for provider in plan.providers.iter() {
        // --- 构建 URL 和 Headers（每个供应商只做一次）---
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
            base_url = format!("{}/v1", base_url);
        }

        let mapped_path = if path == "/responses" || path == "/v1/responses" {
            if provider.protocol == "claude" {
                "/messages".to_string()
            } else {
                "/responses".to_string()
            }
        } else {
            // 去除路径中已有的 /v1 前缀（base_url 已包含 /v1）
            if path.starts_with("/v1/") {
                path.strip_prefix("/v1").unwrap_or(&path).to_string()
            } else {
                path.clone()
            }
        };

        let upstream_url = format!("{}{}{}", base_url, mapped_path, query);

        let mut req_headers = headers.clone();
        req_headers.remove("host");
        req_headers.remove("transfer-encoding");
        req_headers.remove("content-length");
        req_headers.remove("connection");
        req_headers.remove("accept-encoding");

        let safe_key = provider.api_key.trim();
        if let Ok(val) = HeaderValue::from_str(safe_key) {
            if provider.protocol == "claude" {
                req_headers.insert("x-api-key", val);
                if !req_headers.contains_key("anthropic-version") {
                    req_headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
                }
            } else {
                if let Ok(auth_val) = HeaderValue::from_str(&format!("Bearer {}", safe_key)) {
                    req_headers.insert("authorization", auth_val);
                }
            }
        }

        // --- 针对同一个供应商重试 max_attempts 次 ---
        for _attempt in 0..max_attempts {
            let req = state.http_client.request(method.clone(), &upstream_url)
                .headers(req_headers.clone())
                .body(body_bytes.clone());
            let start_time = Instant::now();

            let res_result = tokio::time::timeout(
                Duration::from_secs(plan.timeout_seconds as u64),
                req.send()
            ).await;

            match res_result {
                Ok(Ok(res)) => {
                    let status = res.status();
                    if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
                        // 可重试错误：继续重试同一供应商
                        let body_text = res.text().await.unwrap_or_else(|_| "无法读取上游错误体".to_string());
                        last_error = format!("HTTP {} - {}", status, body_text);
                        let latency = start_time.elapsed().as_millis() as u32;
                        record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, status.as_u16(), latency, Some(last_error.clone()));
                        continue; // 重试同一供应商
                    }

                    // 成功：直接透传流式响应
                    let mut response_builder = Response::builder().status(status);
                    for (k, v) in res.headers().iter() {
                        let k_str = k.as_str().to_lowercase();
                        if k_str != "transfer-encoding" && k_str != "content-encoding" && k_str != "content-length" && k_str != "connection" {
                            response_builder = response_builder.header(k, v);
                        }
                    }
                    let latency = start_time.elapsed().as_millis() as u32;
                    state.balancer.record_success(&provider.id);
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, status.as_u16(), latency, None);
                    let stream = res.bytes_stream().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
                    let body = Body::from_stream(stream);
                    return Ok(response_builder.body(body).unwrap());
                }
                Ok(Err(e)) => {
                    last_error = format!("Reqwest error: {}", e);
                    eprintln!("[OmniGate] Provider {} reqwest error: {}", provider.name, e);
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, 502, latency, Some(last_error.clone()));
                    continue; // 重试同一供应商
                }
                Err(e) => {
                    last_error = format!("Timeout: {}", e);
                    eprintln!("[OmniGate] Provider {} timeout: {}", provider.name, e);
                    let latency = start_time.elapsed().as_millis() as u32;
                    record_usage(&state, &provider.id, &provider.name, &model_name, &req_path, 504, latency, Some(last_error.clone()));
                    continue; // 重试同一供应商
                }
            }
        }
        // 该供应商所有次数耗尽，继续下一个供应商
        state.balancer.record_failure(&provider.id);
    }

    let msg = if last_error.is_empty() {
        "[OmniGate] 所有上游供应商均请求失败。".to_string()
    } else {
        format!("[OmniGate] 上游请求失败: {}", last_error)
    };
    Ok(build_json_error(StatusCode::BAD_GATEWAY, "upstream_error", &msg).into_response())
}

pub async fn handle_fallback(
    request: Request<Body>,
) -> impl IntoResponse {
    (StatusCode::NOT_FOUND, format!("No route found for {}", request.uri().path()))
}
