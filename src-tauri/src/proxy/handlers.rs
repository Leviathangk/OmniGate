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

pub async fn handle_claude_messages(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Body,
) -> Result<impl IntoResponse, StatusCode> {
    let body_bytes = axum::body::to_bytes(body, usize::MAX).await.map_err(|_| StatusCode::BAD_REQUEST)?;

    let plan = state.balancer.get_routing_plan("claude").ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    
    // We can try up to retry_count + 1 times total, but we might exhaust providers first
    let max_attempts = plan.retry_count as usize + 1;
    let mut attempt = 0;
    
    for provider in plan.providers.iter() {
        if attempt >= max_attempts {
            break;
        }
        
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
        
        let req = state.http_client.post(&upstream_url)
            .headers(req_headers)
            .body(body_bytes.clone());

        // Implement timeout
        let res_result = tokio::time::timeout(
            Duration::from_secs(plan.timeout_seconds as u64),
            req.send()
        ).await;

        match res_result {
            Ok(Ok(res)) => {
                let status = res.status();
                if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
                    attempt += 1;
                    continue; // Retry next provider
                }
                
                let mut response_builder = Response::builder().status(status);
                for (k, v) in res.headers().iter() {
                    let k_str = k.as_str().to_lowercase();
                    if k_str != "transfer-encoding" && k_str != "content-encoding" && k_str != "content-length" && k_str != "connection" {
                        response_builder = response_builder.header(k, v);
                    }
                }
                let stream = res.bytes_stream().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
                let body = Body::from_stream(stream);
                return Ok(response_builder.body(body).unwrap());
            }
            _ => {
                // Timeout or network error
                attempt += 1;
                continue;
            }
        }
    }
    
    Err(StatusCode::BAD_GATEWAY)
}

pub async fn handle_opencode_chat(
    State(_state): State<Arc<AppState>>,
    _headers: HeaderMap,
    _body: Body,
) -> Result<impl IntoResponse, StatusCode> {
    Ok((StatusCode::NOT_IMPLEMENTED, "OpenCode proxy not implemented yet").into_response())
}

pub async fn handle_codex_proxy(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request<Body>,
) -> Result<impl IntoResponse, StatusCode> {
    let path = request.uri().path().strip_prefix("/codex").unwrap_or(request.uri().path()).to_string();
    let query = request.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();
    let method = request.method().clone();
    let body_bytes = axum::body::to_bytes(request.into_body(), usize::MAX).await.map_err(|_| StatusCode::BAD_REQUEST)?;

    let plan = state.balancer.get_routing_plan("codex").ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let max_attempts = plan.retry_count as usize + 1;
    let mut attempt = 0;
    
    for provider in plan.providers.iter() {
        if attempt >= max_attempts {
            break;
        }
        
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
                "/messages"
            } else {
                "/responses" // Codex protocol strictly uses /v1/responses
            }
        } else {
            // Remove /v1 prefix if path already has it, because base_url has /v1
            if path.starts_with("/v1/") {
                path.strip_prefix("/v1").unwrap_or(&path)
            } else {
                &path
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
        
        let req = state.http_client.request(method.clone(), &upstream_url)
            .headers(req_headers)
            .body(body_bytes.clone());
            
        let res_result = tokio::time::timeout(
            Duration::from_secs(plan.timeout_seconds as u64),
            req.send()
        ).await;

        match res_result {
            Ok(Ok(res)) => {
                let status = res.status();
                println!("Upstream {} returned status: {}", upstream_url, status);
                if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
                    attempt += 1;
                    continue; // Retry next
                }
                
                let mut response_builder = Response::builder().status(status);
                for (k, v) in res.headers().iter() {
                    let k_str = k.as_str().to_lowercase();
                    if k_str != "transfer-encoding" && k_str != "content-encoding" && k_str != "content-length" && k_str != "connection" {
                        response_builder = response_builder.header(k, v);
                    }
                }
                let stream = res.bytes_stream().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
                let body = Body::from_stream(stream);
                return Ok(response_builder.body(body).unwrap());
            }
            Ok(Err(e)) => {
                eprintln!("Upstream reqwest error: {}", e);
                attempt += 1;
                continue;
            }
            Err(e) => {
                eprintln!("Upstream timeout error: {}", e);
                attempt += 1;
                continue;
            }
        }
    }
    
    Err(StatusCode::BAD_GATEWAY)
}

pub async fn handle_fallback(
    request: Request<Body>,
) -> impl IntoResponse {
    (StatusCode::NOT_FOUND, format!("No route found for {}", request.uri().path()))
}
