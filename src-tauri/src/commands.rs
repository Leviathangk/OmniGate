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
    pub total_mcp: usize,
    pub active_mcp: usize,
    pub today_requests: usize,
    pub today_requests_growth: String,
    pub today_tokens: String,
    pub today_tokens_growth: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientProviderDto {
    pub id: String,
    pub name: String,
    pub api_url: String,
    pub protocol: String,
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
pub fn update_provider_info(
    id: String,
    name: String,
    api_url: String,
    api_key: String,
    protocol: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("供应商名称不能为空".to_string());
    }
    if api_url.trim().is_empty() {
        return Err("API URL 不能为空".to_string());
    }
    state.db.update_provider_info(&id, &name, &api_url, &api_key, &protocol)?;
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
use toml_edit::{DocumentMut, value, Item, Table};

use crate::database::{TrafficPoint, RecentActivity, ModelUsage, HeatmapData};


fn get_codex_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".codex")
    } else {
        PathBuf::from("/Users/guokai/.codex")
    }
}

#[tauri::command]
pub fn get_codex_provider_name() -> Result<Option<String>, String> {
    let temp_dir = get_codex_dir();
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
    state: tauri::State<'_, crate::AppState>
) -> Result<(), String> {
    if !state.proxy_running.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("端口 3456 已被占用，网关服务启动失败！请尝试释放该端口（例如旧版的 OmniGate 残留）后重启客户端。".to_string());
    }

    let temp_dir = get_codex_dir();
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    
    // 1. 修改 config.toml
    let config_path = temp_dir.join("config.toml");
    let config_bak_path = temp_dir.join("config.toml.bak");
    
    if config_path.exists() && !config_bak_path.exists() {
        fs::copy(&config_path, &config_bak_path).map_err(|e| e.to_string())?;
    }
    
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
    let auth_bak_path = temp_dir.join("auth.json.bak");
    
    if auth_path.exists() && !auth_bak_path.exists() {
        fs::copy(&auth_path, &auth_bak_path).map_err(|e| e.to_string())?;
    }
    
    let mut auth_json: serde_json::Value = if auth_path.exists() {
        let content = fs::read_to_string(&auth_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    
    if let Some(obj) = auth_json.as_object_mut() {
        for (_, val) in obj.iter_mut() {
            if val.is_string() {
                *val = serde_json::Value::String(proxy_api_key.clone());
            }
        }
    }
    
    fs::write(&auth_path, serde_json::to_string_pretty(&auth_json).unwrap()).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn restore_codex_config() -> Result<(), String> {
    let temp_dir = get_codex_dir();
    
    let config_path = temp_dir.join("config.toml");
    let config_bak_path = temp_dir.join("config.toml.bak");
    
    if config_bak_path.exists() {
        fs::copy(&config_bak_path, &config_path).map_err(|e| e.to_string())?;
        fs::remove_file(&config_bak_path).map_err(|e| e.to_string())?;
    }
    
    let auth_path = temp_dir.join("auth.json");
    let auth_bak_path = temp_dir.join("auth.json.bak");
    
    if auth_bak_path.exists() {
        fs::copy(&auth_bak_path, &auth_path).map_err(|e| e.to_string())?;
        fs::remove_file(&auth_bak_path).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// ============================================================================
// OpenCode 本地接管
// ============================================================================

fn get_opencode_config_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".config").join("opencode")
    } else {
        PathBuf::from("/tmp/opencode")
    }
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
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    if !state.proxy_running.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("端口 3456 已被占用，网关服务启动失败！请尝试释放该端口（例如旧版的 OmniGate 残留）后重启客户端。".to_string());
    }

    let opencode_dir = get_opencode_config_dir();
    if !opencode_dir.exists() {
        fs::create_dir_all(&opencode_dir).map_err(|e| e.to_string())?;
    }

    let config_path = opencode_dir.join("opencode.json");
    let config_bak_path = opencode_dir.join("opencode.json.bak");

    // 读取或新建 opencode.json
    let mut config: serde_json::Value = if config_path.exists() {
        // 首次备份
        if !config_bak_path.exists() {
            fs::copy(&config_path, &config_bak_path).map_err(|e| e.to_string())?;
        }
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
pub fn restore_opencode_config() -> Result<(), String> {
    let opencode_dir = get_opencode_config_dir();
    let config_path = opencode_dir.join("opencode.json");
    let config_bak_path = opencode_dir.join("opencode.json.bak");

    if config_bak_path.exists() {
        // 有备份：直接还原
        fs::copy(&config_bak_path, &config_path).map_err(|e| e.to_string())?;
        fs::remove_file(&config_bak_path).map_err(|e| e.to_string())?;
    } else if config_path.exists() {
        // 无备份：只删除注入的三个供应商 key
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

fn get_claude_config_dir() -> std::path::PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        std::path::PathBuf::from(home).join(".claude")
    } else {
        std::path::PathBuf::from(".claude")
    }
}

#[tauri::command]
pub fn hijack_claude_config(
    proxy_api_key: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    if !state.proxy_running.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("端口 3456 已被占用，网关服务启动失败！请尝试释放该端口（例如旧版的 OmniGate 残留）后重启客户端。".to_string());
    }

    let claude_dir = get_claude_config_dir();
    if !claude_dir.exists() {
        fs::create_dir_all(&claude_dir).map_err(|e| e.to_string())?;
    }

    let config_path = claude_dir.join("settings.json");
    let config_bak_path = claude_dir.join("settings.json.bak");

    // 读取或新建 settings.json
    let mut config: serde_json::Value = if config_path.exists() {
        if !config_bak_path.exists() {
            fs::copy(&config_path, &config_bak_path).map_err(|e| e.to_string())?;
        }
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
pub fn restore_claude_config() -> Result<(), String> {
    let claude_dir = get_claude_config_dir();
    let config_path = claude_dir.join("settings.json");
    let config_bak_path = claude_dir.join("settings.json.bak");

    if config_bak_path.exists() {
        fs::copy(&config_bak_path, &config_path).map_err(|e| e.to_string())?;
        fs::remove_file(&config_bak_path).map_err(|e| e.to_string())?;
    } else if config_path.exists() {
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

