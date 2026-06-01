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


