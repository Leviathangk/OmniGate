use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;
use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TrafficPoint {
    pub time: String,
    pub count: i64,
    pub avg_latency: f64,
    pub error_count: i64,
}

#[derive(serde::Serialize)]
pub struct ProviderUsageReport {
    pub proxy_clients: Vec<String>,
    pub direct_clients: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentActivity {
    pub id: String,
    pub provider_name: String,
    pub model_name: String,
    pub status_code: u16,
    pub latency_ms: u32,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub protocol: Option<String>,
    pub request_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelUsage {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HeatmapData {
    pub date: String,
    pub count: i64,
}

/// 生成无连字符的 UUID
pub fn generate_uuid() -> String {
    Uuid::new_v4().simple().to_string()
}

// ============================================================================
// Row 结构体（数据库行映射）
// ============================================================================

pub struct ProviderRow {
    pub id: String,
    pub name: String,
    pub api_url: String,
    pub api_key: String,
    pub protocol: String,
    pub is_active: bool,
    pub billing_type: String,
    pub reset_time: Option<String>,
}

pub struct ModelRow {
    pub id: String,
    pub provider_id: String,
    pub name: String,
    pub display_name: String,
    pub cap_reasoning: bool,
    pub cap_vision: bool,
    pub cap_tools: bool,
    pub cap_embedding: bool,
    pub cap_reranking: bool,
    pub cap_long_context: bool,
    pub is_active: bool,
    pub mapping: Option<String>,
    pub is_mapped_default: bool,
}

pub struct SkillRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub is_active: bool,
}

pub struct ClientConfigRow {
    pub client_id: String,
    pub is_enabled: bool,
    pub strategy: String,
    pub retry_count: u32,
    pub timeout_seconds: u32,
    pub manual_provider_id: Option<String>,
    pub direct_provider_id: Option<String>,
    pub operation_mode: String,
}

pub struct ClientConfigProviderRow {
    pub client_id: String,
    pub provider_id: String,
    pub weight: u32,
    pub sort_order: u32,
    pub is_active: bool,
}

// ============================================================================
// DbManager
// ============================================================================

pub struct DbManager {
    pub conn: Mutex<Connection>,
}

#[derive(Debug, Clone)]
pub struct UsageStatMessage {
    pub provider_id: String,
    pub model_name: String,
    pub request_path: String,
    pub status_code: u16,
    pub latency_ms: u32,
    pub error_message: Option<String>,
    pub created_at: i64,
}

impl DbManager {

    pub fn batch_insert_usage_stats(&self, stats: Vec<UsageStatMessage>) -> Result<(), String> {
        if stats.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO usage_statistics (id, provider_id, model_name, request_path, status_code, latency_ms, error_message, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
            ).map_err(|e| e.to_string())?;
            
            for stat in stats {
                let id = uuid::Uuid::new_v4().to_string();
                stmt.execute(rusqlite::params![
                    id,
                    stat.provider_id,
                    stat.model_name,
                    stat.request_path,
                    stat.status_code,
                    stat.latency_ms,
                    stat.error_message,
                    stat.created_at
                ]).map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_today_metrics(&self) -> Result<(usize, String, String, String), String> {
        let conn = self.conn.lock().unwrap();
        
        let today_date = chrono::Local::now().date_naive();
        let today_start = today_date.and_hms_opt(0, 0, 0).unwrap()
            .and_local_timezone(chrono::Local)
            .earliest() // Safe fallback for DST edge cases
            .unwrap_or_else(|| chrono::Local::now())
            .timestamp();
            
        let yesterday_date = today_date - chrono::Duration::try_days(1).unwrap();
        let yesterday_start = yesterday_date.and_hms_opt(0, 0, 0).unwrap()
            .and_local_timezone(chrono::Local)
            .earliest()
            .unwrap_or_else(|| chrono::Local::now() - chrono::Duration::try_days(1).unwrap())
            .timestamp();

        // Today stats
        let mut today_count: i64 = 0;
        let mut today_avg_latency: f64 = 0.0;
        let mut today_success_count: i64 = 0;

        let _ = conn.query_row(
            "SELECT COUNT(*) as count, AVG(latency_ms) as avg_latency, SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) as success_count FROM usage_statistics WHERE created_at >= ?1",
            rusqlite::params![today_start],
            |row| {
                today_count = row.get(0).unwrap_or(0);
                today_avg_latency = row.get(1).unwrap_or(0.0);
                today_success_count = row.get(2).unwrap_or(0);
                Ok(())
            }
        );

        // Yesterday stats
        let mut yest_count: i64 = 0;
        let _ = conn.query_row(
            "SELECT COUNT(*) as count FROM usage_statistics WHERE created_at >= ?1 AND created_at < ?2",
            rusqlite::params![yesterday_start, today_start],
            |row| {
                yest_count = row.get(0).unwrap_or(0);
                Ok(())
            }
        );

        let growth = if yest_count == 0 {
            if today_count == 0 { "0%".to_string() } else { "+100%".to_string() }
        } else {
            let diff = today_count as f64 - yest_count as f64;
            let percent = (diff / yest_count as f64) * 100.0;
            if percent >= 0.0 { format!("+{percent:.1}%") } else { format!("{percent:.1}%") }
        };

        let latency_str = if today_count == 0 { "0 ms".to_string() } else { format!("{} ms", today_avg_latency as i64) };
        let success_rate = if today_count == 0 {
            "100%".to_string()
        } else {
            format!("{:.1}%", (today_success_count as f64 / today_count as f64) * 100.0)
        };

        Ok((today_count as usize, growth, latency_str, success_rate))
    }

    pub fn get_today_traffic_trend(&self) -> Result<Vec<TrafficPoint>, String> {
        let conn = self.conn.lock().unwrap();
        // Today from 00:00 to 23:59
        let today_start = chrono::Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap()
            .and_local_timezone(chrono::Local)
            .earliest()
            .unwrap_or_else(|| chrono::Local::now())
            .timestamp();
        
        let mut stmt = conn.prepare(
            "SELECT strftime('%H:00', datetime(created_at, 'unixepoch', 'localtime')) as hour, 
                    COUNT(*) as count,
                    AVG(latency_ms) as avg_latency,
                    SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
             FROM usage_statistics 
             WHERE created_at >= ?1 
             GROUP BY hour 
             ORDER BY hour ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([today_start], |row| {
            let avg_latency: f64 = row.get(2).unwrap_or(0.0);
            let error_count: i64 = row.get(3).unwrap_or(0);
            Ok(TrafficPoint {
                time: row.get(0)?,
                count: row.get(1)?,
                avg_latency,
                error_count,
            })
        }).map_err(|e| e.to_string())?;

        let mut full_res = Vec::with_capacity(24);
        for i in 0..24 {
            full_res.push(TrafficPoint {
                time: format!("{i:02}:00"),
                count: 0,
                avg_latency: 0.0,
                error_count: 0,
            });
        }

        for r in rows {
            if let Ok(stat) = r {
                if let Some(hr_str) = stat.time.split(':').next() {
                    if let Ok(hr) = hr_str.parse::<usize>() {
                        if hr < 24 {
                            full_res[hr] = stat;
                        }
                    }
                }
            }
        }
        Ok(full_res)
    }

    pub fn get_recent_activities(&self, limit: u32) -> Result<Vec<RecentActivity>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT u.id, IFNULL(p.name, 'Unknown Provider'), u.model_name, u.status_code, u.latency_ms, u.error_message, u.created_at, p.protocol, u.request_path
             FROM usage_statistics u
             LEFT JOIN providers p ON u.provider_id = p.id
             ORDER BY u.created_at DESC
             LIMIT ?1"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([limit], |row| {
            Ok(RecentActivity {
                id: row.get(0)?,
                provider_name: row.get(1)?,
                model_name: row.get(2)?,
                status_code: row.get(3)?,
                latency_ms: row.get(4)?,
                error_message: row.get(5)?,
                created_at: row.get(6)?,
                protocol: row.get(7).unwrap_or(None),
                request_path: row.get(8).unwrap_or_else(|_| String::new()),
            })
        }).map_err(|e| e.to_string())?;

        let mut res = Vec::new();
        for r in rows {
            if let Ok(act) = r {
                res.push(act);
            }
        }
        Ok(res)
    }

    pub fn get_model_usage_distribution(&self) -> Result<Vec<ModelUsage>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT model_name, COUNT(*) as count
             FROM usage_statistics
             WHERE status_code = 200
             GROUP BY model_name
             ORDER BY count DESC
             LIMIT 10"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |row| {
            Ok(ModelUsage {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut res = Vec::new();
        for r in rows {
            if let Ok(m) = r {
                res.push(m);
            }
        }
        Ok(res)
    }

    pub fn get_heatmap_data(&self) -> Result<Vec<HeatmapData>, String> {
        let conn = self.conn.lock().unwrap();
        let six_months_ago = chrono::Utc::now().timestamp() - (180 * 24 * 60 * 60);
        
        let mut stmt = conn.prepare(
            "SELECT strftime('%Y-%m-%d', datetime(created_at, 'unixepoch', 'localtime')) as date, COUNT(*) as count
             FROM usage_statistics
             WHERE created_at >= ?1
             GROUP BY date
             ORDER BY date ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([six_months_ago], |row| {
            Ok(HeatmapData {
                date: row.get(0)?,
                count: row.get(1)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut res = Vec::new();
        for r in rows {
            if let Ok(h) = r {
                res.push(h);
            }
        }
        Ok(res)
    }

    pub fn init(app_config_dir: PathBuf) -> Result<Self, String> {
        if !app_config_dir.exists() {
            fs::create_dir_all(&app_config_dir)
                .map_err(|e| format!("Failed to create config dir: {e}"))?;
        }

        let db_path = app_config_dir.join("omnigate.db");

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {e}"))?;

        // 启用外键约束
        conn.execute("PRAGMA foreign_keys = ON;", [])
            .map_err(|e| format!("Failed to enable foreign keys: {e}"))?;

        let manager = Self { conn: Mutex::new(conn) };
        manager.create_tables().map_err(|e| format!("Failed to create tables: {e}"))?;
        manager.cleanup_old_usage_statistics().map_err(|e| format!("Failed to cleanup old usage statistics: {e}"))?;
        Ok(manager)
    }

    pub fn cleanup_old_usage_statistics(&self) -> Result<(), String> {
        // Data retention: Keep logs for 7 days
        let seven_days_ago = chrono::Utc::now().timestamp() - (7 * 24 * 60 * 60);
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM usage_statistics WHERE created_at < ?1",
            [seven_days_ago],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn create_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();

        // 1. 供应商配置表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                api_url TEXT NOT NULL,
                api_key TEXT NOT NULL,
                protocol TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                billing_type TEXT DEFAULT 'pay_as_you_go',
                reset_time TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
            [],
        ).map_err(|e| e.to_string())?;

        // 尝试无损升级现有表结构
        let _ = conn.execute("ALTER TABLE providers ADD COLUMN billing_type TEXT DEFAULT 'pay_as_you_go';", []);
        let _ = conn.execute("ALTER TABLE providers ADD COLUMN reset_time TEXT;", []);

        // 2. 供应商模型表（含能力字段）
        conn.execute(
            "CREATE TABLE IF NOT EXISTS models (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                name TEXT NOT NULL,
                display_name TEXT,
                cap_reasoning INTEGER DEFAULT 0,
                cap_vision INTEGER DEFAULT 0,
                cap_tools INTEGER DEFAULT 0,
                cap_embedding INTEGER DEFAULT 0,
                cap_reranking INTEGER DEFAULT 0,
                cap_long_context INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at INTEGER NOT NULL,
                is_mapped_default INTEGER DEFAULT 0,
                FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
            );",
            [],
        ).map_err(|e| e.to_string())?;

        // 3. 使用统计表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS usage_statistics (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                model_name TEXT NOT NULL,
                request_path TEXT NOT NULL,
                tokens_prompt INTEGER DEFAULT 0,
                tokens_completion INTEGER DEFAULT 0,
                status_code INTEGER NOT NULL,
                latency_ms INTEGER NOT NULL,
                error_message TEXT,
                created_at INTEGER NOT NULL
            );",
            [],
        ).map_err(|e| e.to_string())?;

        // 3.1 创建索引以大幅提升按时间过滤和按模型聚合查询的速度
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage_statistics(created_at);",
            [],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_usage_created_model ON usage_statistics(created_at, model_name);",
            [],
        ).map_err(|e| e.to_string())?;

        // 4. MCP 服务配置表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS mcp_servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                command TEXT NOT NULL,
                args TEXT NOT NULL,
                env TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at INTEGER NOT NULL
            );",
            [],
        ).map_err(|e| e.to_string())?;

        // 5. Skills 技能配置表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS skills (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                content TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at INTEGER NOT NULL
            );",
            [],
        ).map_err(|e| e.to_string())?;

        // 6. 客户端配置基础表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS client_configs (
                client_id TEXT PRIMARY KEY,
                is_enabled INTEGER DEFAULT 1,
                strategy TEXT NOT NULL,
                retry_count INTEGER NOT NULL,
                timeout_seconds INTEGER NOT NULL,
                manual_provider_id TEXT,
                direct_provider_id TEXT,
                operation_mode TEXT DEFAULT 'proxy',
                updated_at INTEGER NOT NULL
            );",
            [],
        ).map_err(|e| e.to_string())?;

        // 7. 客户端配置的供应商绑定表 (多对多)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS client_config_providers (
                client_id TEXT NOT NULL,
                provider_id TEXT NOT NULL,
                weight INTEGER DEFAULT 1,
                is_active INTEGER DEFAULT 1,
                PRIMARY KEY (client_id, provider_id),
                FOREIGN KEY (client_id) REFERENCES client_configs(client_id) ON DELETE CASCADE,
                FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
            );",
            [],
        ).map_err(|e| e.to_string())?;

        // 尝试添加 sort_order 字段（如果已存在会忽略错误）
        let _ = conn.execute("ALTER TABLE client_config_providers ADD COLUMN sort_order INTEGER DEFAULT 0", []);
        
        // 尝试添加 mapping 字段（用于模型映射）
        let _ = conn.execute("ALTER TABLE models ADD COLUMN mapping TEXT", []);
        
        // 尝试添加 is_mapped_default 字段
        let _ = conn.execute("ALTER TABLE models ADD COLUMN is_mapped_default INTEGER DEFAULT 0", []);

        // 尝试添加 manual_provider_id 字段
        let _ = conn.execute("ALTER TABLE client_configs ADD COLUMN manual_provider_id TEXT", []);

        // 尝试添加 direct_provider_id 字段
        let _ = conn.execute("ALTER TABLE client_configs ADD COLUMN direct_provider_id TEXT", []);

        // 尝试添加 operation_mode 字段
        let _ = conn.execute("ALTER TABLE client_configs ADD COLUMN operation_mode TEXT DEFAULT 'proxy'", []);

        // 8. 全局设置表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS global_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            [],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }

    // ============================================================================
    // Global Settings
    // ============================================================================

    pub fn get_global_setting(&self, key: &str, default_val: &str) -> String {
        let conn = self.conn.lock().unwrap();
        let mut stmt = match conn.prepare("SELECT value FROM global_settings WHERE key = ?1") {
            Ok(s) => s,
            Err(_) => return default_val.to_string(),
        };
        match stmt.query_row(rusqlite::params![key], |row| row.get::<_, String>(0)) {
            Ok(v) => v,
            Err(_) => default_val.to_string(),
        }
    }

    pub fn set_global_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO global_settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ============================================================================
    // Provider CRUD
    // ============================================================================

    pub fn insert_provider(
        &self,
        name: &str,
        api_url: &str,
        api_key: &str,
        protocol: &str,
        billing_type: &str,
        reset_time: Option<&str>,
    ) -> Result<String, String> {
        let conn = self.conn.lock().unwrap();
        let id = generate_uuid();
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO providers (id, name, api_url, api_key, protocol, is_active, billing_type, reset_time, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8, ?8);",
            rusqlite::params![id, name, api_url, api_key, protocol, billing_type, reset_time, now],
        ).map_err(|e| e.to_string())?;
        Ok(id)
    }

    pub fn get_all_providers(&self) -> Result<Vec<ProviderRow>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, api_url, api_key, protocol, is_active, billing_type, reset_time FROM providers ORDER BY created_at ASC;"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |row| {
            Ok(ProviderRow {
                id: row.get(0)?,
                name: row.get(1)?,
                api_url: row.get(2)?,
                api_key: row.get(3)?,
                protocol: row.get(4)?,
                is_active: row.get::<_, i64>(5)? != 0,
                billing_type: row.get(6)?,
                reset_time: row.get(7)?,
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

        Ok(rows)
    }

    pub fn update_provider_info(
        &self,
        id: &str,
        name: &str,
        api_url: &str,
        api_key: &str,
        protocol: &str,
        billing_type: &str,
        reset_time: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE providers SET name = ?1, api_url = ?2, api_key = ?3, protocol = ?4, billing_type = ?5, reset_time = ?6 WHERE id = ?7",
            rusqlite::params![name, api_url, api_key, protocol, billing_type, reset_time, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_provider(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM providers WHERE id = ?1;", rusqlite::params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_provider_usage(&self, provider_id: &str) -> Result<ProviderUsageReport, String> {
        let conn = self.conn.lock().unwrap();
        let mut proxy_clients = Vec::new();
        let mut stmt1 = conn.prepare("SELECT client_id FROM client_config_providers WHERE provider_id = ?1")
            .map_err(|e| e.to_string())?;
        let proxy_iter = stmt1.query_map(rusqlite::params![provider_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        for client in proxy_iter {
            proxy_clients.push(client.unwrap());
        }

        let mut direct_clients = Vec::new();
        let mut stmt2 = conn.prepare("SELECT client_id FROM client_configs WHERE direct_provider_id = ?1")
            .map_err(|e| e.to_string())?;
        let direct_iter = stmt2.query_map(rusqlite::params![provider_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        for client in direct_iter {
            direct_clients.push(client.unwrap());
        }

        Ok(ProviderUsageReport { proxy_clients, direct_clients })
    }

    pub fn clear_provider_references(&self, provider_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp_millis();
        
        // Clear direct_provider_id
        conn.execute(
            "UPDATE client_configs SET direct_provider_id = NULL, updated_at = ?2 WHERE direct_provider_id = ?1;",
            rusqlite::params![provider_id, now],
        ).map_err(|e| e.to_string())?;
        
        // Clear manual_provider_id and reset strategy if needed
        conn.execute(
            "UPDATE client_configs SET manual_provider_id = NULL, strategy = 'fallback', updated_at = ?2 WHERE manual_provider_id = ?1;",
            rusqlite::params![provider_id, now],
        ).map_err(|e| e.to_string())?;
        
        Ok(())
    }

    pub fn update_provider_active(&self, id: &str, is_active: bool) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE providers SET is_active = ?1, updated_at = ?2 WHERE id = ?3;",
            rusqlite::params![is_active as i64, now, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ============================================================================
    // Model CRUD
    // ============================================================================

    pub fn insert_model(&self, row: &ModelRow) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "INSERT OR IGNORE INTO models
             (id, provider_id, name, display_name,
              cap_reasoning, cap_vision, cap_tools, cap_embedding, cap_reranking, cap_long_context,
              is_active, created_at, mapping, is_mapped_default)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14);",
            rusqlite::params![
                row.id,
                row.provider_id,
                row.name,
                row.display_name,
                row.cap_reasoning as i64,
                row.cap_vision as i64,
                row.cap_tools as i64,
                row.cap_embedding as i64,
                row.cap_reranking as i64,
                row.cap_long_context as i64,
                row.is_active as i64,
                now,
                row.mapping,
                row.is_mapped_default as i64,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_models_by_provider(&self, provider_id: &str) -> Result<Vec<ModelRow>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, provider_id, name, display_name,
                    cap_reasoning, cap_vision, cap_tools, cap_embedding, cap_reranking, cap_long_context,
                    is_active, mapping, is_mapped_default
             FROM models WHERE provider_id = ?1 ORDER BY created_at ASC;"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map(rusqlite::params![provider_id], |row| {
            Ok(ModelRow {
                id: row.get(0)?,
                provider_id: row.get(1)?,
                name: row.get(2)?,
                display_name: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                cap_reasoning: row.get::<_, i64>(4)? != 0,
                cap_vision: row.get::<_, i64>(5)? != 0,
                cap_tools: row.get::<_, i64>(6)? != 0,
                cap_embedding: row.get::<_, i64>(7)? != 0,
                cap_reranking: row.get::<_, i64>(8)? != 0,
                cap_long_context: row.get::<_, i64>(9)? != 0,
                is_active: row.get::<_, i64>(10)? != 0,
                mapping: row.get(11)?,
                is_mapped_default: row.get::<_, i64>(12).unwrap_or(0) != 0,
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

        Ok(rows)
    }

    pub fn delete_model(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM models WHERE id = ?1;", rusqlite::params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_model_mapping(&self, id: &str, mapping: Option<String>) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE models SET mapping = ?1 WHERE id = ?2;",
            rusqlite::params![mapping, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_model_mapped_default(&self, provider_id: &str, model_id: &str, is_default: bool) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        if is_default {
            // 先将该 provider 的所有模型取消默认
            conn.execute(
                "UPDATE models SET is_mapped_default = 0 WHERE provider_id = ?1;",
                rusqlite::params![provider_id],
            ).map_err(|e| e.to_string())?;
            // 再设置目标模型
            conn.execute(
                "UPDATE models SET is_mapped_default = 1 WHERE id = ?1;",
                rusqlite::params![model_id],
            ).map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "UPDATE models SET is_mapped_default = 0 WHERE id = ?1;",
                rusqlite::params![model_id],
            ).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn update_model_active(&self, id: &str, is_active: bool) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE models SET is_active = ?1 WHERE id = ?2;",
            rusqlite::params![is_active as i64, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ============================================================================
    // Skills 查询
    // ============================================================================

    pub fn get_all_skills(&self) -> Result<Vec<SkillRow>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, content, is_active FROM skills ORDER BY created_at ASC;"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |row| {
            Ok(SkillRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                content: row.get(3)?,
                is_active: row.get::<_, i64>(4)? != 0,
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

        Ok(rows)
    }

    // ============================================================================
    // 统计查询
    // ============================================================================

    pub fn count_providers(&self) -> Result<(usize, usize), String> {
        let conn = self.conn.lock().unwrap();
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM providers;", [], |r| r.get(0)
        ).map_err(|e| e.to_string())?;
        let active: i64 = conn.query_row(
            "SELECT COUNT(*) FROM providers WHERE is_active = 1;", [], |r| r.get(0)
        ).map_err(|e| e.to_string())?;
        Ok((total as usize, active as usize))
    }

    pub fn count_models(&self) -> Result<(usize, usize), String> {
        let conn = self.conn.lock().unwrap();
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM models;", [], |r| r.get(0)
        ).map_err(|e| e.to_string())?;
        let active: i64 = conn.query_row(
            "SELECT COUNT(*) FROM models WHERE is_active = 1;", [], |r| r.get(0)
        ).map_err(|e| e.to_string())?;
        Ok((total as usize, active as usize))
    }



    pub fn count_skills(&self) -> Result<(usize, usize), String> {
        let conn = self.conn.lock().unwrap();
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM skills;", [], |r| r.get(0)
        ).map_err(|e| e.to_string())?;
        let active: i64 = conn.query_row(
            "SELECT COUNT(*) FROM skills WHERE is_active = 1;", [], |r| r.get(0)
        ).map_err(|e| e.to_string())?;
        Ok((total as usize, active as usize))
    }

    // ============================================================================
    // Client Config CRUD
    // ============================================================================

    pub fn get_client_configs(&self) -> Result<Vec<ClientConfigRow>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT client_id, is_enabled, strategy, retry_count, timeout_seconds, manual_provider_id, operation_mode, direct_provider_id FROM client_configs;"
        ).map_err(|e| e.to_string())?;
        
        let rows = stmt.query_map([], |row| {
            Ok(ClientConfigRow {
                client_id: row.get(0)?,
                is_enabled: row.get::<_, i64>(1)? != 0,
                strategy: row.get(2)?,
                retry_count: row.get::<_, u32>(3)?,
                timeout_seconds: row.get::<_, u32>(4)?,
                manual_provider_id: row.get(5)?,
                operation_mode: row.get::<_, String>(6).unwrap_or_else(|_| "proxy".to_string()),
                direct_provider_id: row.get(7).unwrap_or(None),
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
        
        Ok(rows)
    }

    pub fn get_client_config_providers(&self) -> Result<Vec<ClientConfigProviderRow>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT client_id, provider_id, weight, is_active, sort_order FROM client_config_providers ORDER BY sort_order ASC;"
        ).map_err(|e| e.to_string())?;
        
        let rows = stmt.query_map([], |row| {
            Ok(ClientConfigProviderRow {
                client_id: row.get(0)?,
                provider_id: row.get(1)?,
                weight: row.get::<_, u32>(2)?,
                is_active: row.get::<_, i64>(3)? != 0,
                sort_order: row.get::<_, u32>(4).unwrap_or(0),
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
        
        Ok(rows)
    }

    pub fn save_client_config(&self, config: &ClientConfigRow, providers: &[ClientConfigProviderRow]) -> Result<(), String> {
        let mut conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp_millis();
        
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        
        tx.execute(
            "INSERT OR REPLACE INTO client_configs (client_id, is_enabled, strategy, retry_count, timeout_seconds, manual_provider_id, operation_mode, direct_provider_id, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9);",
            rusqlite::params![config.client_id, config.is_enabled as i64, config.strategy, config.retry_count, config.timeout_seconds, config.manual_provider_id, config.operation_mode, config.direct_provider_id, now],
        ).map_err(|e| e.to_string())?;
        
        tx.execute(
            "DELETE FROM client_config_providers WHERE client_id = ?1;",
            rusqlite::params![config.client_id],
        ).map_err(|e| e.to_string())?;
        
        for (i, p) in providers.iter().enumerate() {
            tx.execute(
                "INSERT INTO client_config_providers (client_id, provider_id, weight, is_active, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5);",
                rusqlite::params![p.client_id, p.provider_id, p.weight, p.is_active as i64, i as u32],
            ).map_err(|e| e.to_string())?;
        }
        
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }
}
