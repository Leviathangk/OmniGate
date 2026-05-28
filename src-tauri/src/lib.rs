mod database;
mod commands;
pub mod models_discovery;

use std::sync::Arc;
use tauri::Manager;
use database::DbManager;

pub struct AppState {
    pub db: Arc<DbManager>,
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
                    app.manage(AppState { db: Arc::new(db) });
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
            commands::discover_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
