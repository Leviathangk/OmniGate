/// models_discovery.rs
///
/// 真实调用 /models 接口（支持 Claude、OpenAI Responses、OpenAI Chat 三种协议），
/// 解析返回的模型列表，并通过规则引擎推断每个模型的能力标签（Capabilities）。
///
/// URL 构建逻辑：
///   - 如果 api_url ends_with("/v1")：endpoint = api_url + "/models"
///   - 否则：endpoint = api_url.trim_end_matches('/') + "/v1/models"

use serde::{Deserialize, Serialize};

// ============================================================================
// OpenAI /v1/models 原始响应结构
// ============================================================================

/// 原始 API 返回的单个模型对象（OpenAI 格式）
#[derive(Debug, Deserialize)]
pub struct RawOpenAIModel {
    pub id: String,
    pub object: Option<String>,
    pub created: Option<i64>,
    pub owned_by: Option<String>,
}

/// 原始 API 返回的列表响应（OpenAI 格式）
#[derive(Debug, Deserialize)]
pub struct OpenAIModelsListResponse {
    pub object: Option<String>,
    pub data: Vec<RawOpenAIModel>,
}

// ============================================================================
// Claude /v1/models 原始响应结构
// ============================================================================

/// 原始 API 返回的单个模型对象（Claude 格式）
#[derive(Debug, Deserialize)]
pub struct RawClaudeModel {
    pub id: String,
    #[serde(rename = "type")]
    pub model_type: Option<String>,
    pub display_name: Option<String>,
    pub created_at: Option<String>,
}

/// 原始 API 返回的列表响应（Claude 格式）
#[derive(Debug, Deserialize)]
pub struct ClaudeModelsListResponse {
    pub data: Vec<RawClaudeModel>,
    pub has_more: Option<bool>,
}

// ============================================================================
// 模型能力标签（Capability Tags）
// ============================================================================

/// 模型能力集合，由规则引擎推断得出
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelCapabilities {
    /// 具备推理/思考链能力（如 o1, o3, claude-3-opus 等）
    pub reasoning: bool,
    /// 支持视觉/图像输入（multimodal）
    pub vision: bool,
    /// 支持 Function Calling / Tool Use
    pub tools: bool,
    /// 为嵌入向量模型（非对话模型）
    pub embedding: bool,
    /// 为文字重排模型
    pub reranking: bool,
    /// 上下文窗口 >= 128K tokens
    pub long_context: bool,
}

// ============================================================================
// 解析后的模型 DTO（返回给前端）
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredModel {
    /// 原始模型 ID（如 gpt-4o-2024-05-13）
    pub id: String,
    /// 模型所属的供应商 ID（用于关联）
    pub provider_id: String,
    /// 模型系列简称（如 gpt-4o，去掉日期后缀）
    pub family: String,
    /// 显示名称（Claude 协议返回；OpenAI 协议则与 family 一致）
    pub display_name: String,
    /// 创建时间戳（Unix ms；Claude 返回字符串时转为 0）
    pub created_at: i64,
    /// 推断出的能力标签
    pub capabilities: ModelCapabilities,
    /// 是否已在本地激活（添加到轮换池）
    pub is_active: bool,
}

// ============================================================================
// 能力推断规则引擎
// ============================================================================

/// 根据模型 ID 推断能力。
///
/// 核心逻辑：
/// 1. 先匹配精确已知模型系列（前缀/关键词），使用结构化规则，而非随意 contains
/// 2. 嵌入/重排模型通过关键词可以相对准确识别
/// 3. 视觉/工具能力对于 GPT-4o 系列可以确定；对于 o1/o3 reasoning 系列需注意其特殊性
/// 4. 无法确定时，不打标签（false），宁可漏报不乱报
pub fn infer_capabilities(model_id: &str) -> ModelCapabilities {
    let id = model_id.to_lowercase();

    // ---- 嵌入向量模型 ----
    if id.contains("embedding") || id.contains("text-embedding") || id.contains("-ada-") || id == "ada" {
        return ModelCapabilities {
            embedding: true,
            ..Default::default()
        };
    }

    // ---- 重排模型 ----
    if id.contains("rerank") {
        return ModelCapabilities {
            reranking: true,
            ..Default::default()
        };
    }

    // ---- GPT 系列 ----
    if id.starts_with("gpt-4o") || id.starts_with("chatgpt-4o") {
        return ModelCapabilities {
            vision: true,
            tools: true,
            long_context: true,
            ..Default::default()
        };
    }

    if id.starts_with("gpt-4-turbo") {
        let vision = id.contains("vision") || !id.contains("preview");
        return ModelCapabilities {
            vision,
            tools: true,
            long_context: true,
            ..Default::default()
        };
    }

    if id.starts_with("gpt-4") {
        let vision = id.contains("vision");
        return ModelCapabilities {
            vision,
            tools: true,
            long_context: false,
            ..Default::default()
        };
    }

    if id.starts_with("gpt-3.5") {
        let tools = id.contains("turbo");
        return ModelCapabilities {
            tools,
            ..Default::default()
        };
    }

    // ---- GPT-5 系列 ----
    if id.starts_with("gpt-5") {
        let reasoning = id.contains("reasoning") || id.contains("think");
        let vision = !id.contains("codex") && !id.contains("embed");
        let tools = !id.contains("embed");
        return ModelCapabilities {
            reasoning,
            vision,
            tools,
            long_context: true,
            ..Default::default()
        };
    }

    // ---- o 系列（OpenAI Reasoning 模型）----
    if id.starts_with("o1-") || id == "o1" {
        return ModelCapabilities {
            reasoning: true,
            ..Default::default()
        };
    }
    if id.starts_with("o3") || id.starts_with("o4") {
        return ModelCapabilities {
            reasoning: true,
            vision: true,
            tools: true,
            long_context: true,
            ..Default::default()
        };
    }
    if id.starts_with("o1") {
        return ModelCapabilities {
            reasoning: true,
            ..Default::default()
        };
    }

    // ---- Claude 系列 ----
    if id.contains("claude-3-opus") || id.contains("claude-opus") {
        return ModelCapabilities {
            reasoning: true,
            vision: true,
            tools: true,
            long_context: true,
            ..Default::default()
        };
    }

    if id.contains("claude-3-5-sonnet") || id.contains("claude-3.5-sonnet")
        || id.contains("claude-3-sonnet") || id.contains("claude-sonnet")
    {
        return ModelCapabilities {
            vision: true,
            tools: true,
            long_context: true,
            ..Default::default()
        };
    }

    if id.contains("claude-3-5-haiku") || id.contains("claude-3.5-haiku") {
        return ModelCapabilities {
            vision: true,
            tools: true,
            ..Default::default()
        };
    }
    if id.contains("claude-3-haiku") || id.contains("claude-haiku") {
        return ModelCapabilities {
            tools: true,
            ..Default::default()
        };
    }

    if id.contains("claude-2") {
        return ModelCapabilities {
            ..Default::default()
        };
    }

    // ---- DeepSeek 系列 ----
    if id.contains("deepseek-r1") || id.contains("deepseek-reasoner") {
        return ModelCapabilities {
            reasoning: true,
            tools: true,
            ..Default::default()
        };
    }
    if id.contains("deepseek-chat") || id.contains("deepseek-coder")
        || id.contains("deepseek-v2") || id.contains("deepseek-v3")
    {
        return ModelCapabilities {
            tools: true,
            ..Default::default()
        };
    }

    // ---- 兜底：无法识别的模型，不打任何标签 ----
    ModelCapabilities::default()
}

/// 从模型 ID 中提取系列简称（去掉日期后缀和版本后缀）
///
/// 示例：
///   gpt-4o-2024-05-13 -> gpt-4o
///   claude-3-5-sonnet-20240620 -> claude-3-5-sonnet
///   o1-mini-2024-09-12 -> o1-mini
pub fn extract_family(model_id: &str) -> String {
    let parts: Vec<&str> = model_id.split(':').collect();
    let base = parts[0];

    let segments: Vec<&str> = base.split('-').collect();
    let mut end = segments.len();

    while end > 1 {
        let last = segments[end - 1];
        if last.chars().all(|c| c.is_ascii_digit()) {
            end -= 1;
        } else {
            break;
        }
    }

    segments[..end].join("-")
}

// ============================================================================
// URL 构建辅助
// ============================================================================

/// 根据 api_url 构建 /models 端点 URL
///
/// - 如果 api_url ends_with("/v1")：endpoint = api_url + "/models"
/// - 否则：endpoint = api_url.trim_end_matches('/') + "/v1/models"
fn build_models_endpoint(api_url: &str) -> String {
    if api_url.ends_with("/v1") {
        format!("{}/models", api_url)
    } else {
        format!("{}/v1/models", api_url.trim_end_matches('/'))
    }
}

// ============================================================================
// 统一入口：按协议调用 /models 接口
// ============================================================================

/// 根据协议类型拉取模型列表。
///
/// - protocol = "claude"           → 使用 x-api-key / anthropic-version 头，解析 Claude 格式，/v1/models
/// - protocol = "codex_responses"  → 使用 Bearer token，解析 OpenAI 格式，/v1/models
/// - protocol = "codex_chat"       → 使用 Bearer token，解析 OpenAI 格式，/models（无 /v1）
pub async fn fetch_models_by_protocol(
    api_url: &str,
    api_key: &str,
    protocol: &str,
    provider_id: &str,
) -> Result<Vec<DiscoveredModel>, String> {
    match protocol {
        "claude" => fetch_models_claude(api_url, api_key, provider_id).await,
        "codex_responses" => fetch_models_openai(api_url, api_key, provider_id, true).await,
        "codex_chat"      => fetch_models_openai(api_url, api_key, provider_id, false).await,
        other => Err(format!("不支持的协议: {}", other)),
    }
}

// ============================================================================
// Claude 协议实现
// ============================================================================

async fn fetch_models_claude(
    api_url: &str,
    api_key: &str,
    provider_id: &str,
) -> Result<Vec<DiscoveredModel>, String> {
    let endpoint = build_models_endpoint(api_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("OmniGate/0.1")
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

    let response = client
        .get(&endpoint)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("请求 {} 失败: {}", endpoint, e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Claude API 返回错误 {}: {}", status.as_u16(), body));
    }

    let list: ClaudeModelsListResponse = response
        .json()
        .await
        .map_err(|e| format!("解析 Claude 响应 JSON 失败: {}", e))?;

    let models = list
        .data
        .into_iter()
        .map(|raw| {
            let caps = infer_capabilities(&raw.id);
            let family = extract_family(&raw.id);
            let display = raw.display_name.unwrap_or_else(|| family.clone());
            DiscoveredModel {
                id: raw.id,
                provider_id: provider_id.to_string(),
                family,
                display_name: display,
                created_at: 0,
                capabilities: caps,
                is_active: false,
            }
        })
        .collect();

    Ok(models)
}

// ============================================================================
// OpenAI 兼容协议实现（codex_responses / codex_chat）
// ============================================================================

/// 调用 OpenAI 兼容接口的 /models 或 /v1/models，返回解析并推断能力后的模型列表
pub async fn fetch_models_openai(
    api_url: &str,
    api_key: &str,
    provider_id: &str,
    use_v1: bool,
) -> Result<Vec<DiscoveredModel>, String> {
    let trimmed = api_url.trim_end_matches('/');
    let endpoint = if use_v1 {
        build_models_endpoint(trimmed)          // → /v1/models
    } else {
        format!("{}/models", trimmed)           // → /models（codex_chat）
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("OmniGate/0.1")
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

    let response = client
        .get(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("请求 {} 失败: {}", endpoint, e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API 返回错误 {}: {}", status.as_u16(), body));
    }

    let list: OpenAIModelsListResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应 JSON 失败: {}", e))?;

    let models = list
        .data
        .into_iter()
        .map(|raw| {
            let caps = infer_capabilities(&raw.id);
            let family = extract_family(&raw.id);
            DiscoveredModel {
                id: raw.id.clone(),
                provider_id: provider_id.to_string(),
                display_name: family.clone(),
                family,
                created_at: raw.created.unwrap_or(0),
                capabilities: caps,
                is_active: false,
            }
        })
        .collect();

    Ok(models)
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_family() {
        assert_eq!(extract_family("gpt-4o-2024-05-13"), "gpt-4o");
        assert_eq!(extract_family("claude-3-5-sonnet-20240620"), "claude-3-5-sonnet");
        assert_eq!(extract_family("o1-mini-2024-09-12"), "o1-mini");
        assert_eq!(extract_family("gpt-4-turbo"), "gpt-4-turbo");
        assert_eq!(extract_family("text-embedding-3-small"), "text-embedding-3-small");
    }

    #[test]
    fn test_build_models_endpoint_with_v1() {
        assert_eq!(
            build_models_endpoint("https://api.openai.com/v1"),
            "https://api.openai.com/v1/models"
        );
    }

    #[test]
    fn test_build_models_endpoint_without_v1() {
        assert_eq!(
            build_models_endpoint("https://api.openai.com"),
            "https://api.openai.com/v1/models"
        );
        assert_eq!(
            build_models_endpoint("https://api.openai.com/"),
            "https://api.openai.com/v1/models"
        );
    }

    #[test]
    fn test_infer_capabilities_gpt4o() {
        let caps = infer_capabilities("gpt-4o-2024-05-13");
        assert!(caps.vision);
        assert!(caps.tools);
        assert!(!caps.reasoning);
        assert!(!caps.embedding);
    }

    #[test]
    fn test_infer_capabilities_o1() {
        let caps = infer_capabilities("o1-mini");
        assert!(caps.reasoning);
        assert!(!caps.tools);
        assert!(!caps.vision);
    }

    #[test]
    fn test_infer_capabilities_o3() {
        let caps = infer_capabilities("o3-mini");
        assert!(caps.reasoning);
        assert!(caps.tools);
        assert!(caps.vision);
    }

    #[test]
    fn test_infer_capabilities_embedding() {
        let caps = infer_capabilities("text-embedding-3-small");
        assert!(caps.embedding);
        assert!(!caps.vision);
        assert!(!caps.tools);
    }

    #[test]
    fn test_infer_capabilities_claude_opus() {
        let caps = infer_capabilities("claude-3-opus-20240229");
        assert!(caps.reasoning);
        assert!(caps.vision);
        assert!(caps.tools);
    }

    #[test]
    fn test_infer_capabilities_deepseek_r1() {
        let caps = infer_capabilities("deepseek-r1");
        assert!(caps.reasoning);
        assert!(caps.tools);
        assert!(!caps.vision);
    }
}
