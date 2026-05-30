mod database;
mod commands;
pub mod models_discovery;
mod proxy;

use std::sync::Arc;
use tauri::Manager;
use database::DbManager;

use std::sync::atomic::{AtomicBool, Ordering};

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
                    tauri::async_runtime::spawn(async move {
                        proxy::server::start_proxy_server(3456, db_arc, proxy_running).await;
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
            commands::delete_provider,
            commands::toggle_provider,
            commands::get_models,
            commands::add_models_to_provider,
            commands::delete_model,
            commands::toggle_model,
            commands::get_mcp_servers,
            commands::get_skills,
            commands::get_usage_overview,
            commands::discover_models,
            commands::get_codex_provider_name,
            commands::hijack_codex_config,
            commands::restore_codex_config,
            commands::get_client_configs,
            commands::save_client_configs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
