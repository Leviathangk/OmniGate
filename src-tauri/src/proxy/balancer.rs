use super::models::ProxyProvider;
use rand::Rng;
use std::sync::Arc;
use crate::database::DbManager;
use std::collections::HashMap;

pub struct RoutingPlan {
    pub providers: Vec<ProxyProvider>,
    pub timeout_seconds: u32,
    pub retry_count: u32,
}

pub struct Balancer {
    db: Arc<DbManager>,
}

impl Balancer {
    pub fn new(db: Arc<DbManager>) -> Self {
        Self { db }
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
                // 手动模式：只取 sort_order 最小的那一个，不做轮换
                attached_providers.sort_by_key(|p| p.sort_order);
                attached_providers.truncate(1);
            }
            _ => {
                // 默认退化为优先级顺序
                attached_providers.sort_by_key(|p| p.sort_order);
            }
        }

        Some(RoutingPlan {
            providers: attached_providers,
            timeout_seconds: config.timeout_seconds,
            retry_count: config.retry_count,
        })
    }
}
