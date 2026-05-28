use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use crate::database::{generate_uuid, ModelRow};
use crate::models_discovery;

// ============================================================================
// 数据结构定义（DTO）
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDto {
    pub id: String,
    pub name: String,
    pub api_url: String,
    pub api_key: String,
    pub protocol: String, // "claude", "codex_responses", "codex_chat"
    pub is_active: bool,
    pub weight: i32,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelDto {
    pub id: String,
    pub provider_id: String,
    pub name: String,
    pub display_name: String,
    pub is_active: bool,
    // 能力标签（由规则引擎推断，而非 API 直接返回）
    pub cap_reasoning: bool,
    pub cap_vision: bool,
    pub cap_tools: bool,
    pub cap_embedding: bool,
    pub cap_reranking: bool,
    pub cap_long_context: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerDto {
    pub id: String,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageOverview {
    pub total_providers: usize,
    pub active_providers: usize,
    pub total_models: usize,
    pub active_models: usize,
    pub total_skills: usize,
    pub active_skills: usize,
    pub total_mcp: usize,
    pub active_mcp: usize,
    pub today_requests: usize,
    pub today_requests_growth: String,
    pub today_tokens: String,
    pub today_tokens_growth: String,
}

// ============================================================================
// 供应商命令
// ============================================================================

#[tauri::command]
pub fn get_providers(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<ProviderDto>, String> {
    let rows = state.db.get_all_providers()?;
    let dtos = rows.into_iter().map(|r| ProviderDto {
        id: r.id,
        name: r.name,
        api_url: r.api_url,
        api_key: r.api_key,
        protocol: r.protocol,
        is_active: r.is_active,
        weight: 1,
        priority: 1,
    }).collect();
    Ok(dtos)
}

#[tauri::command]
pub fn add_provider(
    name: String,
    api_url: String,
    api_key: String,
    protocol: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<String, String> {
    if name.trim().is_empty() {
        return Err("供应商名称不能为空".to_string());
    }
    if api_url.trim().is_empty() {
        return Err("API URL 不能为空".to_string());
    }
    let id = state.db.insert_provider(&name, &api_url, &api_key, &protocol)?;
    Ok(id)
}

#[tauri::command]
pub fn delete_provider(
    id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state.db.delete_provider(&id)
}

#[tauri::command]
pub fn toggle_provider(
    id: String,
    is_active: bool,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state.db.update_provider_active(&id, is_active)
}

// ============================================================================
// 模型命令
// ============================================================================

#[tauri::command]
pub fn get_models(
    provider_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<ModelDto>, String> {
    let rows = state.db.get_models_by_provider(&provider_id)?;
    let dtos = rows.into_iter().map(|r| ModelDto {
        id: r.id,
        provider_id: r.provider_id,
        name: r.name,
        display_name: r.display_name,
        is_active: r.is_active,
        cap_reasoning: r.cap_reasoning,
        cap_vision: r.cap_vision,
        cap_tools: r.cap_tools,
        cap_embedding: r.cap_embedding,
        cap_reranking: r.cap_reranking,
        cap_long_context: r.cap_long_context,
    }).collect();
    Ok(dtos)
}

#[tauri::command]
pub fn add_models_to_provider(
    provider_id: String,
    model_names: Vec<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<usize, String> {
    let mut inserted = 0usize;
    for model_name in &model_names {
        let caps = models_discovery::infer_capabilities(model_name);
        let family = models_discovery::extract_family(model_name);
        let row = ModelRow {
            id: generate_uuid(),
            provider_id: provider_id.clone(),
            name: model_name.clone(),
            display_name: family,
            cap_reasoning: caps.reasoning,
            cap_vision: caps.vision,
            cap_tools: caps.tools,
            cap_embedding: caps.embedding,
            cap_reranking: caps.reranking,
            cap_long_context: caps.long_context,
            is_active: true,
        };
        state.db.insert_model(&row)?;
        inserted += 1;
    }
    Ok(inserted)
}

#[tauri::command]
pub fn delete_model(
    id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state.db.delete_model(&id)
}

#[tauri::command]
pub fn toggle_model(
    id: String,
    is_active: bool,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state.db.update_model_active(&id, is_active)
}

// ============================================================================
// MCP & Skills
// ============================================================================

#[tauri::command]
pub fn get_mcp_servers(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<McpServerDto>, String> {
    let rows = state.db.get_all_mcp_servers()?;
    let mut dtos = Vec::new();
    for r in rows {
        // args 存储为 JSON 字符串，反序列化为 Vec<String>
        let args: Vec<String> = serde_json::from_str(&r.args)
            .unwrap_or_default();
        // env 存储为 JSON 字符串，反序列化为 HashMap<String, String>
        let env: HashMap<String, String> = serde_json::from_str(&r.env)
            .unwrap_or_default();
        dtos.push(McpServerDto {
            id: r.id,
            name: r.name,
            command: r.command,
            args,
            env,
            is_active: r.is_active,
        });
    }
    Ok(dtos)
}

#[tauri::command]
pub fn get_skills(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<SkillDto>, String> {
    let rows = state.db.get_all_skills()?;
    let dtos = rows.into_iter().map(|r| SkillDto {
        id: r.id,
        name: r.name,
        description: r.description,
        content: r.content,
        is_active: r.is_active,
    }).collect();
    Ok(dtos)
}

// ============================================================================
// 统计（从 DB 计算真实数量）
// ============================================================================

#[tauri::command]
pub fn get_usage_overview(
    state: tauri::State<'_, crate::AppState>,
) -> Result<UsageOverview, String> {
    let (total_providers, active_providers) = state.db.count_providers()?;
    let (total_models, active_models) = state.db.count_models()?;
    let (total_mcp, active_mcp) = state.db.count_mcp_servers()?;
    let (total_skills, active_skills) = state.db.count_skills()?;

    Ok(UsageOverview {
        total_providers,
        active_providers,
        total_models,
        active_models,
        total_skills,
        active_skills,
        total_mcp,
        active_mcp,
        today_requests: 0,
        today_requests_growth: "0%".to_string(),
        today_tokens: "0".to_string(),
        today_tokens_growth: "0%".to_string(),
    })
}

// ============================================================================
// 发现模型（真实 HTTP，不访问 DB）
// ============================================================================

/// 根据协议调用真实 /models 接口，返回模型列表（不写入 DB，由前端决定是否保存）。
#[tauri::command]
pub async fn discover_models(
    api_url: String,
    api_key: String,
    protocol: String,
    provider_id: String,
) -> Result<Vec<ModelDto>, String> {
    if api_key.trim().is_empty() {
        return Err("API Key 不能为空".to_string());
    }
    if api_url.trim().is_empty() {
        return Err("API URL 不能为空".to_string());
    }

    let discovered = models_discovery::fetch_models_by_protocol(
        &api_url,
        &api_key,
        &protocol,
        &provider_id,
    ).await?;

    let dtos = discovered.into_iter().map(|m| ModelDto {
        id: format!("disc_{}", &m.id),
        provider_id: m.provider_id,
        name: m.id,
        display_name: m.display_name,
        is_active: false,
        cap_reasoning: m.capabilities.reasoning,
        cap_vision: m.capabilities.vision,
        cap_tools: m.capabilities.tools,
        cap_embedding: m.capabilities.embedding,
        cap_reranking: m.capabilities.reranking,
        cap_long_context: m.capabilities.long_context,
    }).collect();

    Ok(dtos)
}
