use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;
use chrono::Utc;

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
}

pub struct McpRow {
    pub id: String,
    pub name: String,
    pub command: String,
    pub args: String,
    pub env: String,
    pub is_active: bool,
}

pub struct SkillRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub is_active: bool,
}

// ============================================================================
// DbManager
// ============================================================================

pub struct DbManager {
    pub conn: Mutex<Connection>,
}

impl DbManager {
    pub fn init(app_config_dir: PathBuf) -> Result<Self, String> {
        if !app_config_dir.exists() {
            fs::create_dir_all(&app_config_dir)
                .map_err(|e| format!("Failed to create config dir: {}", e))?;
        }

        let db_path = app_config_dir.join("omnigate.db");

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // 启用外键约束
        conn.execute("PRAGMA foreign_keys = ON;", [])
            .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

        let manager = Self { conn: Mutex::new(conn) };
        manager.create_tables().map_err(|e| format!("Failed to create tables: {}", e))?;

        Ok(manager)
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
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
            [],
        ).map_err(|e| e.to_string())?;

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
    ) -> Result<String, String> {
        let conn = self.conn.lock().unwrap();
        let id = generate_uuid();
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO providers (id, name, api_url, api_key, protocol, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6);",
            rusqlite::params![id, name, api_url, api_key, protocol, now],
        ).map_err(|e| e.to_string())?;
        Ok(id)
    }

    pub fn get_all_providers(&self) -> Result<Vec<ProviderRow>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, api_url, api_key, protocol, is_active FROM providers ORDER BY created_at ASC;"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |row| {
            Ok(ProviderRow {
                id: row.get(0)?,
                name: row.get(1)?,
                api_url: row.get(2)?,
                api_key: row.get(3)?,
                protocol: row.get(4)?,
                is_active: row.get::<_, i64>(5)? != 0,
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

        Ok(rows)
    }

    pub fn delete_provider(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM providers WHERE id = ?1;", rusqlite::params![id])
            .map_err(|e| e.to_string())?;
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
              is_active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12);",
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
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_models_by_provider(&self, provider_id: &str) -> Result<Vec<ModelRow>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, provider_id, name, display_name,
                    cap_reasoning, cap_vision, cap_tools, cap_embedding, cap_reranking, cap_long_context,
                    is_active
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

    pub fn update_model_active(&self, id: &str, is_active: bool) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE models SET is_active = ?1 WHERE id = ?2;",
            rusqlite::params![is_active as i64, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ============================================================================
    // MCP & Skills 查询
    // ============================================================================

    pub fn get_all_mcp_servers(&self) -> Result<Vec<McpRow>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, command, args, env, is_active FROM mcp_servers ORDER BY created_at ASC;"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |row| {
            Ok(McpRow {
                id: row.get(0)?,
                name: row.get(1)?,
                command: row.get(2)?,
                args: row.get(3)?,
                env: row.get(4)?,
                is_active: row.get::<_, i64>(5)? != 0,
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

        Ok(rows)
    }

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

    pub fn count_mcp_servers(&self) -> Result<(usize, usize), String> {
        let conn = self.conn.lock().unwrap();
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM mcp_servers;", [], |r| r.get(0)
        ).map_err(|e| e.to_string())?;
        let active: i64 = conn.query_row(
            "SELECT COUNT(*) FROM mcp_servers WHERE is_active = 1;", [], |r| r.get(0)
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
}
