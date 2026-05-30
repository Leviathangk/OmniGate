use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyProvider {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub api_url: String,
    pub api_key: String,
    pub weight: u32,
    pub sort_order: u32,
}

#[derive(Debug, Clone)]
pub struct ProxyConfig {
    pub client_id: String,
    pub providers: Vec<ProxyProvider>,
    pub strategy: String,
    pub retry_count: u32,
    pub timeout_seconds: u32,
}
