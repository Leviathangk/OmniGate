mod database;
mod commands;
pub mod models_discovery;
mod proxy;

use std::sync::Arc;
use tauri::Manager;
use tauri::Emitter;
use database::DbManager;

use std::sync::atomic::AtomicBool;

pub struct AppState {
    pub db: Arc<DbManager>,
    pub proxy_running: Arc<AtomicBool>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 在用户配置路径下初始化数据库并建表
            let config_dir = app.path().app_config_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from(".config"));
            
            match DbManager::init(config_dir) {
                Ok(db) => {
                    let db_arc = Arc::new(db);
                    let proxy_running = Arc::new(AtomicBool::new(false));
                    app.manage(AppState { 
                        db: db_arc.clone(),
                        proxy_running: proxy_running.clone(),
                    });
                    
                    // Start proxy server on default port 3456
                    let proxy_db_arc = db_arc.clone();
                    tauri::async_runtime::spawn(async move {
                        proxy::server::start_proxy_server(3456, proxy_db_arc, proxy_running).await;
                    });
                    
                    // Dashboard event emitter loop
                    let app_handle = app.handle().clone();
                    let db_for_events = db_arc.clone();
                    tauri::async_runtime::spawn(async move {
                        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
                        loop {
                            interval.tick().await;
                            
                            let (total_providers, active_providers) = db_for_events.count_providers().unwrap_or((0, 0));
                            let (total_models, active_models) = db_for_events.count_models().unwrap_or((0, 0));
                            let (total_skills, active_skills) = db_for_events.count_skills().unwrap_or((0, 0));
                            
                            let overview = serde_json::json!({
                                "total_providers": total_providers,
                                "active_providers": active_providers,
                                "total_models": total_models,
                                "active_models": active_models,
                                "total_skills": total_skills,
                                "active_skills": active_skills,
                                "today_requests": 0,
                                "today_requests_growth": "0%",
                                "today_tokens": "0",
                                "today_tokens_growth": "0%"
                            });

                            if let (Ok(traffic), Ok(recent), Ok(model_usage), Ok(heatmap)) = (
                                db_for_events.get_today_traffic_trend(),
                                db_for_events.get_recent_activities(10),
                                db_for_events.get_model_usage_distribution(),
                                db_for_events.get_heatmap_data()
                            ) {
                                let payload = serde_json::json!({
                                    "overview": overview,
                                    "traffic": traffic,
                                    "recent": recent,
                                    "model_usage": model_usage,
                                    "heatmap": heatmap
                                });
                                let _ = app_handle.emit("dashboard-updated", payload);
                            }
                        }
                    });
                }
                Err(e) => {
                    eprintln!("Failed to initialize database: {}", e);
                    // 即使数据库初始化失败，在开发/Mock阶段我们也可以继续启动
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_providers,
            commands::add_provider,
            commands::update_provider_info,
            commands::delete_provider,
            commands::toggle_provider,
            commands::get_models,
            commands::add_models_to_provider,
            commands::delete_model,
            commands::toggle_model,
            commands::update_model_mapping,
            commands::update_model_mapped_default,
            commands::get_skills,
            commands::get_usage_overview,
            commands::discover_models,
            commands::get_codex_provider_name,
            commands::hijack_codex_config,
            commands::restore_codex_config,
            commands::hijack_opencode_config,
            commands::apply_direct_config,
            commands::restore_opencode_config,
            commands::hijack_claude_config,
            commands::restore_claude_config,
            commands::get_client_configs,
            commands::save_client_configs,
            commands::get_today_traffic_trend,
            commands::get_recent_activities,
            commands::get_model_usage_distribution,
            commands::get_heatmap_data,
            commands::check_cli_installed,
            commands::read_external_prompt,
            commands::write_external_prompt
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
