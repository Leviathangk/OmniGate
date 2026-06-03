use super::models::ProxyProvider;
use rand::Rng;
use std::sync::{Arc, RwLock};
use crate::database::DbManager;
use std::collections::HashMap;
use chrono::{Utc, NaiveTime, Local, TimeZone};
use tauri::Emitter;

#[derive(Debug, Clone)]
pub struct PenaltyInfo {
    pub count: u32,
    pub last_penalty_time: i64,
}

pub struct RoutingPlan {
    pub providers: Vec<ProxyProvider>,
}

pub struct Balancer {
    db: Arc<DbManager>,
    penalties: RwLock<HashMap<String, PenaltyInfo>>,
}

impl Balancer {
    pub fn new(db: Arc<DbManager>) -> Self {
        Self { 
            db,
            penalties: RwLock::new(HashMap::new()),
        }
    }

    pub fn record_failure(&self, provider_id: &str, app_handle: &tauri::AppHandle) {
        if let Ok(mut map) = self.penalties.write() {
            let now = Utc::now().timestamp();
            let penalty = map.entry(provider_id.to_string()).or_insert(PenaltyInfo { count: 0, last_penalty_time: now });
            if penalty.count < 10 { // Max penalty is 10
                penalty.count += 1;
            }
            penalty.last_penalty_time = now;
        }
        let _ = app_handle.emit("active_provider_changed", ());
    }

    pub fn record_success(&self, _provider_id: &str) {
        // success doesn't reset penalty anymore, it's lazy time-based!
        // or we could decrement it? No, keep it simple.
    }

    pub fn reset_penalty(&self, provider_id: &str) {
        if let Ok(mut map) = self.penalties.write() {
            map.remove(provider_id);
        }
    }

    pub fn get_routing_plan(&self, client_id: &str) -> Option<RoutingPlan> {
        let configs = self.db.get_client_configs().unwrap_or_default();
        let config = configs.into_iter().find(|c| c.client_id == client_id)?;

        if !config.is_enabled {
            return None;
        }

        let all_providers = self.db.get_all_providers().unwrap_or_default();
        let mut provider_map = HashMap::new();
        for p in all_providers {
            // 修复问题3：只收录全局 is_active = true 的供应商
            if p.is_active {
                provider_map.insert(p.id.clone(), p);
            }
        }

        let config_providers = self.db.get_client_config_providers().unwrap_or_default();
        let mut attached_providers: Vec<_> = config_providers
            .into_iter()
            // 过滤：绑定关系的 is_active，且供应商本身在 provider_map 中（即全局 is_active）
            .filter(|p| p.client_id == client_id && p.is_active)
            .filter_map(|cp| {
                if let Some(p) = provider_map.get(&cp.provider_id) {
                    Some(ProxyProvider {
                        id: p.id.clone(),
                        name: p.name.clone(),
                        protocol: p.protocol.clone(),
                        api_url: p.api_url.clone(),
                        api_key: p.api_key.clone(),
                        billing_type: p.billing_type.clone(),
                        reset_time: p.reset_time.clone(),
                        weight: cp.weight,
                        sort_order: cp.sort_order,
                    })
                } else {
                    None
                }
            })
            .collect();

        if attached_providers.is_empty() {
            return None;
        }

        // Helper function for reset timestamp
        let get_recent_reset_timestamp = |time_str: &str| -> i64 {
            let now = Local::now();
            let parts: Vec<&str> = time_str.split(':').collect();
            if parts.len() == 2 {
                if let (Ok(h), Ok(m)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                    if let Some(time) = NaiveTime::from_hms_opt(h, m, 0) {
                        if let Some(mut reset_datetime) = Local.from_local_datetime(&now.date_naive().and_time(time)).single() {
                            if reset_datetime > now {
                                reset_datetime -= chrono::Duration::try_days(1).unwrap();
                            }
                            return reset_datetime.timestamp();
                        }
                    }
                }
            }
            0
        };

        // --- 惰性评估时间并清空过期惩罚 ---
        if let Ok(mut write_map) = self.penalties.write() {
            let now_ts = Utc::now().timestamp();

            for p in &attached_providers {
                if let Some(penalty) = write_map.get(&p.id) {
                    let mut should_reset = false;
                    
                    if p.billing_type == "subscription" {
                        let reset_time_str = p.reset_time.as_deref().unwrap_or("00:00");
                        let reset_ts = get_recent_reset_timestamp(reset_time_str);
                        if penalty.last_penalty_time < reset_ts {
                            should_reset = true;
                        }
                        // 对于订阅制，除了到点重置，如果宕机超过 1 小时也自动释放惩罚，应对临时服务挂掉
                        if penalty.last_penalty_time < now_ts - 3600 {
                            should_reset = true;
                        }
                    } else {
                        // pay_as_you_go: custom hours decay (default 1 hour)
                        let hours_str = p.reset_time.as_deref().unwrap_or("1");
                        let hours = hours_str.parse::<i64>().unwrap_or(1);
                        if penalty.last_penalty_time < now_ts - (hours * 3600) {
                            should_reset = true;
                        }
                    }

                    if should_reset {
                        write_map.remove(&p.id);
                    }
                }
            }
        }

        // --- 惩罚降级与“大家平权”逻辑 ---
        if let Ok(map) = self.penalties.read() {
            let mut all_penalized = true;
            for p in &attached_providers {
                let count = map.get(&p.id).map(|info| info.count).unwrap_or(0);
                if count == 0 {
                    all_penalized = false;
                    break;
                }
            }
            drop(map); // 释放读锁

            if all_penalized {
                // 大家平权：所有当前可用的节点都处于惩罚状态，直接全部重置满血
                if let Ok(mut write_map) = self.penalties.write() {
                    for p in &attached_providers {
                        write_map.remove(&p.id);
                    }
                }
            }
        }

        // 应用惩罚到临时副本
        if let Ok(map) = self.penalties.read() {
            for p in &mut attached_providers {
                let penalty = map.get(&p.id).map(|info| info.count).unwrap_or(0);
                if penalty > 0 {
                    // 顺序模式：每次惩罚将排序后延 1000 位
                    p.sort_order = p.sort_order.saturating_add(penalty * 1000);
                    // 随机模式：每次惩罚将权重除以 2（最小为 1）
                    let divisor = 1_u32.checked_shl(penalty).unwrap_or(1024);
                    p.weight = std::cmp::max(1, p.weight / divisor);
                }
            }
        }

        // Apply strategy
        match config.strategy.as_str() {
            "priority" => {
                // 严格按 sort_order 升序，weight 字段不参与
                attached_providers.sort_by_key(|p| p.sort_order);
            }
            "random" => {
                // 修复问题1：加权随机排序（Exponential distribution method）
                // 每个供应商得分 = -ln(U) / weight，得分越小越靠前
                // weight 越大 → 得分期望越小 → 越有可能排在前面
                let mut rng = rand::thread_rng();
                let mut scored: Vec<(f64, usize)> = attached_providers
                    .iter()
                    .enumerate()
                    .map(|(i, p)| {
                        let w = p.weight.max(1) as f64;
                        let r: f64 = rng.gen::<f64>().max(1e-9); // 避免 ln(0)
                        let score = -(r.ln()) / w;
                        (score, i)
                    })
                    .collect();
                scored.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
                let reordered: Vec<ProxyProvider> = scored
                    .iter()
                    .map(|(_, i)| attached_providers[*i].clone())
                    .collect();
                attached_providers = reordered;
            }
            "manual" => {
                // 手动模式：优先取 manual_provider_id，否则取优先级最高
                attached_providers.sort_by_key(|p| p.sort_order);
                if let Some(ref manual_id) = config.manual_provider_id {
                    if let Some(pos) = attached_providers.iter().position(|p| p.id == *manual_id) {
                        let selected = attached_providers.remove(pos);
                        attached_providers.clear();
                        attached_providers.push(selected);
                    } else {
                        attached_providers.truncate(1);
                    }
                } else {
                    attached_providers.truncate(1);
                }
            }
            _ => {
                // 默认退化为优先级顺序
                attached_providers.sort_by_key(|p| p.sort_order);
            }
        }

        Some(RoutingPlan {
            providers: attached_providers,
        })
    }
}
