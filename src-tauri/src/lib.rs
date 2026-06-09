mod database;
mod commands;
pub mod models_discovery;
mod proxy;

use std::sync::Arc;
use tauri::Manager;
use tauri::Emitter;
use tauri::menu::{Menu, MenuItem, Submenu, CheckMenuItem, CheckMenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use database::DbManager;

pub struct TrayMenuState {
    pub claude_proxy: CheckMenuItem<tauri::Wry>,
    pub claude_direct: CheckMenuItem<tauri::Wry>,
    pub claude_off: CheckMenuItem<tauri::Wry>,
    pub codex_proxy: CheckMenuItem<tauri::Wry>,
    pub codex_direct: CheckMenuItem<tauri::Wry>,
    pub codex_off: CheckMenuItem<tauri::Wry>,
    pub opencode_proxy: CheckMenuItem<tauri::Wry>,
    pub opencode_direct: CheckMenuItem<tauri::Wry>,
    pub opencode_off: CheckMenuItem<tauri::Wry>,
}

use std::sync::atomic::AtomicBool;

pub struct AppState {
    pub db: Arc<DbManager>,
    pub proxy_running: Arc<AtomicBool>,
    pub balancer: Arc<crate::proxy::balancer::Balancer>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .setup(|app| {
            // 在用户配置路径下初始化数据库并建表
            let config_dir = app.path().app_config_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from(".config"));
            
            match DbManager::init(config_dir.clone()) {
                Ok(db) => {
                    let db_arc = Arc::new(db);
                    let balancer = Arc::new(crate::proxy::balancer::Balancer::new(db_arc.clone()));
                    let proxy_running = Arc::new(AtomicBool::new(false));
                    app.manage(AppState { 
                        db: db_arc.clone(),
                        proxy_running: proxy_running.clone(),
                        balancer: balancer.clone(),
                    });
                    
                    // Start proxy server on default port 3456
                    let proxy_db_arc = db_arc.clone();
                    let proxy_balancer_arc = balancer.clone();
                    let proxy_app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        proxy::server::start_proxy_server(3456, proxy_db_arc, proxy_balancer_arc, proxy_running, proxy_app_handle).await;
                    });
                    
                    // Daily cleanup loop
                    let db_for_cleanup = db_arc.clone();
                    tauri::async_runtime::spawn(async move {
                        // 每天 (24h) 执行一次清理
                        let mut interval = tokio::time::interval(std::time::Duration::from_secs(24 * 60 * 60));
                        loop {
                            interval.tick().await;
                            if let Err(e) = db_for_cleanup.cleanup_old_usage_statistics() {
                                eprintln!("Failed to run daily cleanup: {e}");
                            }
                        }
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
                            
                            let (today_req, growth, avg_lat, succ_rate) = db_for_events.get_today_metrics().unwrap_or((0, "0%".to_string(), "0 ms".to_string(), "100%".to_string()));
                            
                            let overview = serde_json::json!({
                                "total_providers": total_providers,
                                "active_providers": active_providers,
                                "total_models": total_models,
                                "active_models": active_models,
                                "total_skills": total_skills,
                                "active_skills": active_skills,
                                "today_requests": today_req,
                                "today_requests_growth": growth,
                                "today_avg_latency": avg_lat,
                                "today_success_rate": succ_rate
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
                    eprintln!("Failed to initialize database: {e}");
                    // 即使数据库初始化失败，在开发/Mock阶段我们也可以继续启动
                }
            }

            // --- 系统托盘设置 ---
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;

            let claude_proxy = CheckMenuItemBuilder::new("接管模式").id("claude_proxy").build(app)?;
            let claude_direct = CheckMenuItemBuilder::new("直连模式").id("claude_direct").build(app)?;
            let claude_off = CheckMenuItemBuilder::new("关闭接管模式").id("claude_off").checked(true).build(app)?;
            let claude_menu = Submenu::with_items(app, "Claude", true, &[&claude_proxy, &claude_direct, &claude_off])?;

            let codex_proxy = CheckMenuItemBuilder::new("接管模式").id("codex_proxy").build(app)?;
            let codex_direct = CheckMenuItemBuilder::new("直连模式").id("codex_direct").build(app)?;
            let codex_off = CheckMenuItemBuilder::new("关闭接管模式").id("codex_off").checked(true).build(app)?;
            let codex_menu = Submenu::with_items(app, "Codex", true, &[&codex_proxy, &codex_direct, &codex_off])?;

            let opencode_proxy = CheckMenuItemBuilder::new("接管模式").id("opencode_proxy").build(app)?;
            let opencode_direct = CheckMenuItemBuilder::new("直连模式").id("opencode_direct").build(app)?;
            let opencode_off = CheckMenuItemBuilder::new("关闭接管模式").id("opencode_off").checked(true).build(app)?;
            let opencode_menu = Submenu::with_items(app, "OpenCode", true, &[&opencode_proxy, &opencode_direct, &opencode_off])?;

            app.manage(TrayMenuState {
                claude_proxy: claude_proxy.clone(),
                claude_direct: claude_direct.clone(),
                claude_off: claude_off.clone(),
                codex_proxy: codex_proxy.clone(),
                codex_direct: codex_direct.clone(),
                codex_off: codex_off.clone(),
                opencode_proxy: opencode_proxy.clone(),
                opencode_direct: opencode_direct.clone(),
                opencode_off: opencode_off.clone(),
            });

            let menu = Menu::with_items(app, &[
                &show_i,
                &claude_menu,
                &codex_menu,
                &opencode_menu,
                &quit_i
            ])?;

            let tray_builder = TrayIconBuilder::new().menu(&menu);
            let tray_builder = if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder.icon(icon)
            } else {
                tray_builder
            };

            let _tray = tray_builder
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    match id {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        id if id.ends_with("_proxy") => {
                            let client = id.replace("_proxy", "");
                            let _ = app.emit("tray-set-mode", serde_json::json!({ "client_id": client, "mode": "proxy" }));
                        }
                        id if id.ends_with("_direct") => {
                            let client = id.replace("_direct", "");
                            let _ = app.emit("tray-set-mode", serde_json::json!({ "client_id": client, "mode": "direct" }));
                        }
                        id if id.ends_with("_off") => {
                            let client = id.replace("_off", "");
                            let _ = app.emit("tray-set-mode", serde_json::json!({ "client_id": client, "mode": "off" }));
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            // --- 托盘设置结束 ---

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 拦截关闭事件，改为隐藏窗口
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_providers,
            commands::add_provider,
            commands::update_provider_info,
            commands::reset_provider_penalty,
            commands::get_current_active_provider,
            commands::toggle_provider,
            commands::check_provider_usage,
            commands::cascade_delete_provider,
            commands::detach_provider_from_clients,
            commands::delete_provider,
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
            commands::get_opencode_direct_providers,
            commands::has_opencode_direct_provider,
            commands::remove_opencode_direct_provider,
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
            commands::write_external_prompt,
            commands::update_tray_menu_state,
            commands::get_global_setting,
            commands::set_global_setting,
            commands::read_client_raw_config,
            commands::write_client_raw_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
