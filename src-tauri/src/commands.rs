use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use tauri::Emitter;
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
    pub billing_type: String,
    pub reset_time: Option<String>,
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
    pub mapping: Option<String>,
    pub is_mapped_default: bool,
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
    pub today_requests: usize,
    pub today_requests_growth: String,
    pub today_avg_latency: String,
    pub today_success_rate: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientProviderDto {
    pub id: String,
    pub name: String,
    pub api_url: String,
    pub protocol: String,
    pub billing_type: String,
    pub reset_time: Option<String>,
    pub weight: u32,
    #[serde(default)]
    pub sort_order: u32,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientConfigDto {
    pub client_id: String,
    pub is_enabled: bool,
    pub strategy: String,
    pub retry_count: u32,
    pub timeout_seconds: u32,
    pub manual_provider_id: Option<String>,
    pub direct_provider_id: Option<String>,
    pub operation_mode: String,
    pub providers: Vec<ClientProviderDto>,
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
        billing_type: r.billing_type,
        reset_time: r.reset_time,
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
    billing_type: String,
    reset_time: Option<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<String, String> {
    if name.trim().is_empty() {
        return Err("供应商名称不能为空".to_string());
    }
    if api_url.trim().is_empty() {
        return Err("API URL 不能为空".to_string());
    }
    let id = state.db.insert_provider(&name, &api_url, &api_key, &protocol, &billing_type, reset_time.as_deref())?;
    Ok(id)
}

#[tauri::command]
pub fn update_provider_info(
    id: String,
    name: String,
    api_url: String,
    api_key: String,
    protocol: String,
    billing_type: String,
    reset_time: Option<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("供应商名称不能为空".to_string());
    }
    if api_url.trim().is_empty() {
        return Err("API URL 不能为空".to_string());
    }
    state.db.update_provider_info(&id, &name, &api_url, &api_key, &protocol, &billing_type, reset_time.as_deref())?;
    Ok(())
}

#[tauri::command]
pub fn check_provider_usage(id: String, state: tauri::State<'_, crate::AppState>) -> Result<crate::database::ProviderUsageReport, String> {
    state.db.get_provider_usage(&id)
}

#[tauri::command]
pub fn reset_provider_penalty(
    id: String,
    state: tauri::State<'_, crate::AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    state.balancer.reset_penalty(&id);
    let _ = app_handle.emit("active_provider_changed", ());
    Ok(())
}

#[tauri::command]
pub fn get_current_active_provider(
    client_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Option<String>, String> {
    if let Some(plan) = state.balancer.get_routing_plan(&client_id) {
        if let Some(provider) = plan.providers.first() {
            return Ok(Some(provider.id.clone()));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn cascade_delete_provider(
    id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    let usage = state.db.get_provider_usage(&id)?;

    // 1. Process Direct clients
    for client_id in usage.direct_clients {
        match client_id.as_str() {
            "opencode" => {
                let _ = remove_opencode_direct_provider(id.clone(), app_handle.clone());
            },
            "claude" => {
                let _ = restore_claude_config(app_handle.clone());
            },
            "codex" => {
                let _ = restore_codex_config();
            },
            _ => {}
        }
    }

    // 2. Clear direct/manual provider references in DB
    state.db.clear_provider_references(&id)?;

    // 3. Delete from DB (cascades to proxy lists)
    state.db.delete_provider(&id)?;

    Ok(())
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
        mapping: r.mapping,
        is_mapped_default: r.is_mapped_default,
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
            mapping: None,
            is_mapped_default: false,
        };
        state.db.insert_model(&row)?;
        inserted += 1;
    }
    Ok(inserted)
}

#[tauri::command]
pub fn update_model_mapped_default(
    provider_id: String,
    model_id: String,
    is_default: bool,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state.db.update_model_mapped_default(&provider_id, &model_id, is_default)
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

#[tauri::command]
pub fn update_model_mapping(
    id: String,
    mapping: Option<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    let mapping_cleaned = mapping.and_then(|m| if m.trim().is_empty() { None } else { Some(m.trim().to_string()) });
    state.db.update_model_mapping(&id, mapping_cleaned)
}

// ============================================================================
// MCP Server & Skills
// ============================================================================



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
    let (total_skills, active_skills) = state.db.count_skills()?;

    let (today_req, growth, avg_lat, succ_rate) = state.db.get_today_metrics()
        .unwrap_or((0, "0%".to_string(), "0 ms".to_string(), "100%".to_string()));

    Ok(UsageOverview {
        total_providers,
        active_providers,
        total_models,
        active_models,
        total_skills,
        active_skills,
        today_requests: today_req,
        today_requests_growth: growth,
        today_avg_latency: avg_lat,
        today_success_rate: succ_rate,
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
        mapping: None,
        is_mapped_default: false,
    }).collect();

    Ok(dtos)
}

// ============================================================================
// Codex 本地接管
// ============================================================================

use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use toml_edit::{DocumentMut, value, Item, Table};

use crate::database::{TrafficPoint, RecentActivity, ModelUsage, HeatmapData};

fn get_user_home_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .home_dir()
        .map_err(|_| "Could not find home directory".to_string())
}

fn get_codex_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(get_user_home_dir(app_handle)?.join(".codex"))
}

#[tauri::command]
pub fn get_codex_provider_name(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    let temp_dir = get_codex_dir(&app_handle)?;
    let config_path = temp_dir.join("config.toml");
    if !config_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let doc = content.parse::<DocumentMut>().map_err(|e| e.to_string())?;
    
    if let Some(provider) = doc.get("model_provider").and_then(|i| i.as_str()) {
        Ok(Some(provider.to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn hijack_codex_config(
    provider_name: String, 
    base_url: String, 
    proxy_api_key: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>
) -> Result<(), String> {
    if !state.proxy_running.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("端口 3456 已被占用，网关服务启动失败！请尝试释放该端口（例如旧版的 OmniGate 残留）后重启客户端。".to_string());
    }

    let temp_dir = get_codex_dir(&app_handle)?;
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    
    // 1. 修改 config.toml
    let config_path = temp_dir.join("config.toml");
    
    let mut doc = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        content.parse::<DocumentMut>().map_err(|e| e.to_string())?
    } else {
        DocumentMut::new()
    };
    
    doc["model_provider"] = value(&provider_name);
    
    if !doc.contains_key("model_providers") {
        doc["model_providers"] = Item::Table(Table::new());
    }
    
    if let Some(providers_table) = doc["model_providers"].as_table_mut() {
        if !providers_table.contains_key(&provider_name) {
            providers_table.insert(&provider_name, Item::Table(Table::new()));
        }
        
        if let Some(provider_item) = providers_table.get_mut(&provider_name) {
            provider_item["base_url"] = value(format!("{}/codex", base_url.trim_end_matches('/')));
            provider_item["name"] = value(&provider_name);
        }
    }
    
    fs::write(&config_path, doc.to_string()).map_err(|e| e.to_string())?;
    
    // 2. 修改 auth.json
    let auth_path = temp_dir.join("auth.json");
    
    let mut auth_json: serde_json::Value = if auth_path.exists() {
        let content = fs::read_to_string(&auth_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    
    auth_json["OPENAI_API_KEY"] = serde_json::Value::String(proxy_api_key.clone());
    
    fs::write(&auth_path, serde_json::to_string_pretty(&auth_json).unwrap()).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn restore_codex_config() -> Result<(), String> {
    // We no longer restore .bak files to preserve direct config
    // The user's direct config will overwrite these anyway
    
    Ok(())
}

// ============================================================================
// OpenCode 本地接管
// ============================================================================

fn get_opencode_config_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(get_user_home_dir(app_handle)?.join(".config").join("opencode"))
}

/// 将 HashMap<model_name, model_name> 序列化为 opencode 的 models 字典格式：
/// { "model-id": { "name": "model-id" } }
fn build_opencode_models_dict(model_names: &std::collections::HashSet<String>) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for name in model_names {
        map.insert(name.clone(), serde_json::json!({ "name": name }));
    }
    serde_json::Value::Object(map)
}

#[tauri::command]
pub fn hijack_opencode_config(
    proxy_api_key: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    if !state.proxy_running.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("端口 3456 已被占用，网关服务启动失败！请尝试释放该端口（例如旧版的 OmniGate 残留）后重启客户端。".to_string());
    }

    let opencode_dir = get_opencode_config_dir(&app_handle)?;
    if !opencode_dir.exists() {
        fs::create_dir_all(&opencode_dir).map_err(|e| e.to_string())?;
    }

    let config_path = opencode_dir.join("opencode.json");

    // 读取或新建 opencode.json
    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({
            "$schema": "https://opencode.ai/config.json"
        }))
    } else {
        serde_json::json!({
            "$schema": "https://opencode.ai/config.json"
        })
    };

    // 从数据库查询 opencode 客户端配置
    let all_providers = state.db.get_all_providers().map_err(|e| e.to_string())?;
    let client_config_providers = state.db.get_client_config_providers().map_err(|e| e.to_string())?;

    // 构建全局供应商 Map（id -> ProviderRow）
    let mut provider_map: std::collections::HashMap<String, &crate::database::ProviderRow> = std::collections::HashMap::new();
    for p in &all_providers {
        provider_map.insert(p.id.clone(), p);
    }

    // 按 client_id 分别读取各协议的供应商（3 个独立路由计划）
    let collect_models_for_client = |client_id: &str| -> std::collections::HashSet<String> {
        let mut models: std::collections::HashSet<String> = std::collections::HashSet::new();
        let cps: Vec<_> = client_config_providers.iter()
            .filter(|cp| cp.client_id == client_id && cp.is_active)
            .collect();
        for cp in cps {
            if let Some(p) = provider_map.get(&cp.provider_id) {
                if !p.is_active { continue; }
                if let Ok(ms) = state.db.get_models_by_provider(&p.id) {
                    for m in ms.iter().filter(|m| m.is_active) {
                        models.insert(m.name.clone());
                    }
                }
            }
        }
        models
    };

    let claude_models = collect_models_for_client("opencode-claude");
    let responses_models = collect_models_for_client("opencode-resp");
    let chat_models = collect_models_for_client("opencode-chat");

    // 确保 provider 字段存在
    if !config.get("provider").is_some_and(|v| v.is_object()) {
        config["provider"] = serde_json::json!({});
    }

    let base_url = "http://127.0.0.1:3456";

    // 写入 omnigate-claude（Claude Messages 协议 → /opencode/claude）
    if let Some(providers) = config["provider"].as_object_mut() {
        providers.insert("omnigate-claude".to_string(), serde_json::json!({
            "npm": "@ai-sdk/anthropic",
            "name": "OmniGate (Claude)",
            "options": {
                "baseURL": format!("{}/opencode/claude/v1", base_url),
                "apiKey": proxy_api_key
            },
            "models": build_opencode_models_dict(&claude_models)
        }));

        // 写入 omnigate-resp（Responses 协议 → /opencode/responses）
        providers.insert("omnigate-resp".to_string(), serde_json::json!({
            "npm": "@ai-sdk/openai",
            "name": "OmniGate (Responses)",
            "options": {
                "baseURL": format!("{}/opencode/responses", base_url),
                "apiKey": proxy_api_key
            },
            "models": build_opencode_models_dict(&responses_models)
        }));

        // 写入 omnigate-chat（Chat Completions 协议 → /opencode/chat）
        providers.insert("omnigate-chat".to_string(), serde_json::json!({
            "npm": "@ai-sdk/openai-compatible",
            "name": "OmniGate (Chat)",
            "options": {
                "baseURL": format!("{}/opencode/chat", base_url),
                "apiKey": proxy_api_key
            },
            "models": build_opencode_models_dict(&chat_models)
        }));
    }

    // 保存 opencode.json
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn restore_opencode_config(app_handle: tauri::AppHandle) -> Result<(), String> {
    let opencode_dir = get_opencode_config_dir(&app_handle)?;
    let config_path = opencode_dir.join("opencode.json");

    if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        if let Ok(mut config) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(providers) = config["provider"].as_object_mut() {
                providers.remove("omnigate-claude");
                providers.remove("omnigate-resp");
                providers.remove("omnigate-chat");
            }
            let new_content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
            fs::write(&config_path, new_content).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}



// ============================================================================
// Claude Configuration Hijack
// ============================================================================

fn get_claude_config_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(get_user_home_dir(app_handle)?.join(".claude"))
}

#[tauri::command]
pub fn hijack_claude_config(
    proxy_api_key: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    if !state.proxy_running.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("端口 3456 已被占用，网关服务启动失败！请尝试释放该端口（例如旧版的 OmniGate 残留）后重启客户端。".to_string());
    }

    let claude_dir = get_claude_config_dir(&app_handle)?;
    if !claude_dir.exists() {
        fs::create_dir_all(&claude_dir).map_err(|e| e.to_string())?;
    }

    let config_path = claude_dir.join("settings.json");

    // 读取或新建 settings.json
    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if !config.get("env").is_some_and(|v| v.is_object()) {
        config["env"] = serde_json::json!({});
    }

    if let Some(env) = config["env"].as_object_mut() {
        env.insert("ANTHROPIC_BASE_URL".to_string(), serde_json::Value::String("http://127.0.0.1:3456/claude".to_string()));
        env.insert("ANTHROPIC_AUTH_TOKEN".to_string(), serde_json::Value::String(proxy_api_key));
    }

    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn restore_claude_config(app_handle: tauri::AppHandle) -> Result<(), String> {
    let claude_dir = get_claude_config_dir(&app_handle)?;
    let config_path = claude_dir.join("settings.json");

    if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        if let Ok(mut config) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(env) = config.get_mut("env").and_then(|v| v.as_object_mut()) {
                env.remove("ANTHROPIC_BASE_URL");
                env.remove("ANTHROPIC_AUTH_TOKEN");
            }
            let new_content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
            fs::write(&config_path, new_content).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}


// ============================================================================
// Client Config
// ============================================================================

#[tauri::command]
pub fn get_client_configs(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<ClientConfigDto>, String> {
    let configs = state.db.get_client_configs()?;
    let config_providers = state.db.get_client_config_providers()?;
    let all_providers = state.db.get_all_providers()?;

    let mut provider_map = HashMap::new();
    for p in all_providers {
        provider_map.insert(p.id.clone(), p);
    }

    let mut result = Vec::new();
    for c in configs {
        let mut providers = Vec::new();
        for cp in config_providers.iter().filter(|x| x.client_id == c.client_id) {
            if let Some(p) = provider_map.get(&cp.provider_id) {
                providers.push(ClientProviderDto {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    api_url: p.api_url.clone(),
                    protocol: p.protocol.clone(),
                    billing_type: p.billing_type.clone(),
                    reset_time: p.reset_time.clone(),
                    weight: cp.weight,
                    sort_order: cp.sort_order,
                    is_active: cp.is_active,
                });
            }
        }
        result.push(ClientConfigDto {
            client_id: c.client_id,
            is_enabled: c.is_enabled,
            strategy: c.strategy,
            retry_count: c.retry_count,
            timeout_seconds: c.timeout_seconds,
            manual_provider_id: c.manual_provider_id,
            direct_provider_id: c.direct_provider_id,
            operation_mode: c.operation_mode,
            providers,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn save_client_configs(
    configs: Vec<ClientConfigDto>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    for c in configs {
        let config_row = crate::database::ClientConfigRow {
            client_id: c.client_id.clone(),
            is_enabled: c.is_enabled,
            strategy: c.strategy.clone(),
            retry_count: c.retry_count,
            timeout_seconds: c.timeout_seconds,
            manual_provider_id: c.manual_provider_id.clone(),
            direct_provider_id: c.direct_provider_id.clone(),
            operation_mode: c.operation_mode.clone(),
        };
        let mut provider_rows = Vec::new();
        for p in c.providers {
            provider_rows.push(crate::database::ClientConfigProviderRow {
                client_id: c.client_id.clone(),
                provider_id: p.id.clone(),
                weight: p.weight,
                sort_order: p.sort_order,
                is_active: p.is_active,
            });
        }
        state.db.save_client_config(&config_row, &provider_rows)?;
    }
    Ok(())
}


// ============================================================================
// Dashboard Statistics
// ============================================================================

#[tauri::command]
pub fn get_today_traffic_trend(state: tauri::State<'_, crate::AppState>) -> Result<Vec<TrafficPoint>, String> {
    state.db.get_today_traffic_trend()
}

#[tauri::command]
pub fn get_recent_activities(limit: u32, state: tauri::State<'_, crate::AppState>) -> Result<Vec<RecentActivity>, String> {
    state.db.get_recent_activities(limit)
}

#[tauri::command]
pub fn get_model_usage_distribution(state: tauri::State<'_, crate::AppState>) -> Result<Vec<ModelUsage>, String> {
    state.db.get_model_usage_distribution()
}

#[tauri::command]
pub fn get_heatmap_data(state: tauri::State<'_, crate::AppState>) -> Result<Vec<HeatmapData>, String> {
    state.db.get_heatmap_data()
}

// ============================================================================
// Global System Prompt File Management
// ============================================================================

fn get_cli_prompt_path(app_handle: &tauri::AppHandle, client_id: &str) -> Result<std::path::PathBuf, String> {
    let home_dir = get_user_home_dir(app_handle)?;
    let path = match client_id {
        "claude" => home_dir.join(".claude").join("CLAUDE.md"),
        "opencode" => home_dir.join(".config").join("opencode").join("AGENTS.md"),
        "codex" => home_dir.join(".codex").join("AGENTS.md"),
        _ => return Err(format!("Unknown client_id for global prompt: {}", client_id)),
    };
    Ok(path)
}

#[tauri::command]
pub fn check_cli_installed(client_id: String, app_handle: tauri::AppHandle) -> Result<bool, String> {
    let path = get_cli_prompt_path(&app_handle, &client_id)?;
    if let Some(parent) = path.parent() {
        Ok(parent.exists() && parent.is_dir())
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn read_external_prompt(client_id: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_cli_prompt_path(&app_handle, &client_id)?;
    if path.exists() {
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
    } else {
        Ok("".to_string())
    }
}

#[tauri::command]
pub fn write_external_prompt(client_id: String, content: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let path = get_cli_prompt_path(&app_handle, &client_id)?;
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err(format!("目录 {} 不存在，不主动创建外部系统目录。", parent.display()));
        }
    }
    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

// ============================================================================
// Direct Config Mode Injection
// ============================================================================

#[tauri::command]
pub fn apply_direct_config(
    client_id: String,
    provider_id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    let providers = state.db.get_all_providers().map_err(|e| e.to_string())?;
    let provider = providers.into_iter().find(|p| p.id == provider_id)
        .ok_or_else(|| "Provider not found".to_string())?;

    match client_id.as_str() {
        "claude" => {
            let claude_dir = get_claude_config_dir(&app_handle)?;
            if !claude_dir.exists() {
                std::fs::create_dir_all(&claude_dir).map_err(|e| e.to_string())?;
            }
            let config_path = claude_dir.join("settings.json");
            let config_bak_path = claude_dir.join("settings.json.bak");
            
            let mut config: serde_json::Value = if config_path.exists() {
                if !config_bak_path.exists() {
                    std::fs::copy(&config_path, &config_bak_path).map_err(|e| e.to_string())?;
                }
                let content = std::fs::read_to_string(&config_path).unwrap_or_default();
                serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
            } else {
                serde_json::json!({})
            };
            
            if !config.get("env").is_some_and(|v| v.is_object()) {
                config["env"] = serde_json::json!({});
            }
            
            if let Some(env) = config["env"].as_object_mut() {
                env.insert("ANTHROPIC_BASE_URL".to_string(), serde_json::Value::String(provider.api_url.clone()));
                env.insert("ANTHROPIC_AUTH_TOKEN".to_string(), serde_json::Value::String(provider.api_key.clone()));
            }
            let out = serde_json::to_string_pretty(&config).unwrap();
            std::fs::write(&config_path, out).map_err(|e| e.to_string())?;
        },
        "codex" => {
            let codex_dir = get_codex_dir(&app_handle)?;
            if !codex_dir.exists() {
                std::fs::create_dir_all(&codex_dir).map_err(|e| e.to_string())?;
            }
            let config_path = codex_dir.join("config.toml");
            let config_bak_path = codex_dir.join("config.toml.bak");
            
            if config_path.exists() && !config_bak_path.exists() {
                std::fs::copy(&config_path, &config_bak_path).map_err(|e| e.to_string())?;
            }
            
            let mut doc = if config_path.exists() {
                let content = std::fs::read_to_string(&config_path).unwrap_or_default();
                content.parse::<toml_edit::DocumentMut>().unwrap_or_else(|_| toml_edit::DocumentMut::new())
            } else {
                toml_edit::DocumentMut::new()
            };
            
            let provider_name = "custom"; // Or provider.name, but codex typically uses "custom" for custom endpoints
            doc["model_provider"] = toml_edit::value(provider_name);
            
            if !doc.contains_key("model_providers") {
                doc["model_providers"] = toml_edit::Item::Table(toml_edit::Table::new());
            }
            
            if let Some(providers_table) = doc["model_providers"].as_table_mut() {
                if !providers_table.contains_key(provider_name) {
                    providers_table.insert(provider_name, toml_edit::Item::Table(toml_edit::Table::new()));
                }
                
                if let Some(provider_item) = providers_table.get_mut(provider_name) {
                    provider_item["base_url"] = toml_edit::value(provider.api_url.clone());
                    provider_item["name"] = toml_edit::value(provider_name);
                }
            }
            
            std::fs::write(&config_path, doc.to_string()).map_err(|e| e.to_string())?;
            
            // auth.json
            let auth_path = codex_dir.join("auth.json");
            let auth_bak_path = codex_dir.join("auth.json.bak");
            if auth_path.exists() && !auth_bak_path.exists() {
                std::fs::copy(&auth_path, &auth_bak_path).map_err(|e| e.to_string())?;
            }
            
            let mut auth_doc: serde_json::Value = if auth_path.exists() {
                let content = std::fs::read_to_string(&auth_path).unwrap_or_default();
                serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
            } else {
                serde_json::json!({})
            };
            
            auth_doc["OPENAI_API_KEY"] = serde_json::Value::String(provider.api_key.clone());
            std::fs::write(&auth_path, serde_json::to_string_pretty(&auth_doc).unwrap()).map_err(|e| e.to_string())?;
        },
        "opencode" => {
            let opencode_dir = get_opencode_config_dir(&app_handle)?;
            if !opencode_dir.exists() {
                std::fs::create_dir_all(&opencode_dir).map_err(|e| e.to_string())?;
            }
            let config_path = opencode_dir.join("opencode.json");
            let mut config: serde_json::Value = if config_path.exists() {
                let content = std::fs::read_to_string(&config_path).unwrap_or_default();
                serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({
                    "$schema": "https://opencode.ai/config.json"
                }))
            } else {
                serde_json::json!({
                    "$schema": "https://opencode.ai/config.json"
                })
            };
            
            if !config.get("provider").is_some_and(|v| v.is_object()) {
                config["provider"] = serde_json::json!({});
            }
            
            let models = state.db.get_models_by_provider(&provider.id).unwrap_or_default();
            let mut model_names = std::collections::HashSet::new();
            for m in models {
                if m.is_active {
                    model_names.insert(m.name.clone());
                }
            }
            
            let mut clean_url = provider.api_url.clone()
                .trim_end_matches('/')
                .trim_end_matches("/chat/completions")
                .trim_end_matches("/messages")
                .trim_end_matches('/')
                .to_string();
            let has_version = {
                let parts: Vec<&str> = clean_url.split('/').collect();
                if let Some(last) = parts.last() {
                    last.starts_with('v') && last.len() > 1 && last[1..].chars().all(|c| c.is_ascii_digit())
                } else { false }
            };
            if !has_version {
                clean_url = format!("{}/v1", clean_url);
            }
            
            if let Some(providers_obj) = config["provider"].as_object_mut() {
                providers_obj.insert(format!("direct-{}", provider.id), serde_json::json!({
                    "npm": match provider.protocol.as_str() {
                        "claude" => "@ai-sdk/anthropic",
                        "codex_responses" => "@ai-sdk/openai",
                        _ => "@ai-sdk/openai-compatible",
                    },
                    "name": format!("OmniGate-Provider({})", provider.name),
                    "options": {
                        "baseURL": clean_url,
                        "apiKey": provider.api_key.clone()
                    },
                    "models": build_opencode_models_dict(&model_names)
                }));
            }
            
            let out = serde_json::to_string_pretty(&config).unwrap();
            std::fs::write(&config_path, out).map_err(|e| e.to_string())?;
        },
        _ => return Err(format!("Unknown clientId for direct config: {}", client_id)),
    }
    
    Ok(())
}

#[tauri::command]
pub fn get_opencode_direct_providers(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let opencode_dir = get_opencode_config_dir(&app_handle)?;
    let config_path = opencode_dir.join("opencode.json");
    if !config_path.exists() {
        return Ok(vec![]);
    }
    
    let content = std::fs::read_to_string(&config_path).unwrap_or_default();
    let config: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));
    
    let mut providers = Vec::new();
    if let Some(provider_obj) = config.get("provider").and_then(|v| v.as_object()) {
        for key in provider_obj.keys() {
            if key.starts_with("direct-") {
                providers.push(key.trim_start_matches("direct-").to_string());
            }
        }
    }
    
    Ok(providers)
}

#[tauri::command]
pub fn remove_opencode_direct_provider(
    provider_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let opencode_dir = get_opencode_config_dir(&app_handle)?;
    let config_path = opencode_dir.join("opencode.json");
    if !config_path.exists() {
        return Ok(());
    }
    
    let content = std::fs::read_to_string(&config_path).unwrap_or_default();
    let mut config: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));
    
    if let Some(provider_obj) = config.get_mut("provider").and_then(|v| v.as_object_mut()) {
        provider_obj.remove(&format!("direct-{}", provider_id));
    }
    
    let out = serde_json::to_string_pretty(&config).unwrap();
    std::fs::write(&config_path, out).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn update_tray_menu_state(
    client_id: String,
    mode: String,
    state: tauri::State<'_, crate::TrayMenuState>,
) -> Result<(), String> {
    let check_proxy = mode == "proxy";
    let check_direct = mode == "direct";
    let check_off = mode == "off" || (mode != "proxy" && mode != "direct");

    match client_id.as_str() {
        "claude" => {
            let _ = state.claude_proxy.set_checked(check_proxy);
            let _ = state.claude_direct.set_checked(check_direct);
            let _ = state.claude_off.set_checked(check_off);
        }
        "codex" => {
            let _ = state.codex_proxy.set_checked(check_proxy);
            let _ = state.codex_direct.set_checked(check_direct);
            let _ = state.codex_off.set_checked(check_off);
        }
        "opencode" => {
            let _ = state.opencode_proxy.set_checked(check_proxy);
            let _ = state.opencode_direct.set_checked(check_direct);
            let _ = state.opencode_off.set_checked(check_off);
        }
        _ => {}
    }
    
    Ok(())
}

// ============================================================================
// Global Settings
// ============================================================================

#[tauri::command]
pub fn get_global_setting(
    key: String,
    default_val: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<String, String> {
    Ok(state.db.get_global_setting(&key, &default_val))
}

#[tauri::command]
pub fn set_global_setting(
    key: String,
    value: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state.db.set_global_setting(&key, &value)
}
