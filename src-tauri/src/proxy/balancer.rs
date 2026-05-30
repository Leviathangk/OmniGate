use super::models::{ProxyConfig, ProxyProvider};
use rand::seq::SliceRandom;
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
            provider_map.insert(p.id.clone(), p);
        }

        let config_providers = self.db.get_client_config_providers().unwrap_or_default();
        let mut attached_providers: Vec<_> = config_providers
            .into_iter()
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
                attached_providers.sort_by(|a, b| a.sort_order.cmp(&b.sort_order));
            }
            "random" => {
                let mut rng = rand::thread_rng();
                attached_providers.shuffle(&mut rng);
            }
            "manual" => {
                attached_providers.sort_by(|a, b| a.sort_order.cmp(&b.sort_order));
                attached_providers.truncate(1);
            }
            _ => {
                attached_providers.sort_by(|a, b| a.sort_order.cmp(&b.sort_order));
            }
        }

        Some(RoutingPlan {
            providers: attached_providers,
            timeout_seconds: config.timeout_seconds,
            retry_count: config.retry_count,
        })
    }
}
