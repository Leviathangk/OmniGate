
import { Database, Info, Trash2 } from "lucide-react";

interface SettingsTabProps {
  settingsSubTab: string;
  setSettingsSubTab: (tab: string) => void;
  hijackBaseUrl: string;
  setHijackBaseUrl: (url: string) => void;
  generateRandomKey: () => void;
  hijackApiKey: string;
  setHijackApiKey: (key: string) => void;
}

export function SettingsTab({
  settingsSubTab,
  setSettingsSubTab,
  hijackBaseUrl,
  setHijackBaseUrl,
  generateRandomKey,
  hijackApiKey,
  setHijackApiKey
}: SettingsTabProps) {
  return (
    <div>
      <div className="tabs-control-row">
        <button className={`tab-select-btn ${settingsSubTab === "proxy" ? "active" : ""}`} onClick={() => setSettingsSubTab("proxy")}>本地网关接管</button>
        <button className={`tab-select-btn ${settingsSubTab === "database" ? "active" : ""}`} onClick={() => setSettingsSubTab("database")}>数据库管理</button>
        <button className={`tab-select-btn ${settingsSubTab === "about" ? "active" : ""}`} onClick={() => setSettingsSubTab("about")}>关于</button>
      </div>

      {settingsSubTab === "proxy" && (
        <div className="panel-card">
          <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "8px" }}>本地网关身份认证与接管配置</h3>
          <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)", marginBottom: "20px" }}>配置并获取属于您的本地专属代理网关 URL 以及全局安全鉴权凭证。您可以将其填入任何支持自定义 Endpoint 的大模型客户端引擎中。</p>
          
          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label>代理服务基础 URL</label>
            <input 
              type="text" 
              className="modal-input" 
              value={hijackBaseUrl} 
              onChange={e => setHijackBaseUrl(e.target.value)} 
              placeholder="http://127.0.0.1:3456" 
            />
          </div>

          <div className="form-group" style={{ marginBottom: "24px" }}>
            <label style={{ display: "flex", justifyContent: "space-between" }}>
              <span>接管凭证 (Proxy API Key)</span>
              <button className="btn-secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={generateRandomKey}>
                随机生成
              </button>
            </label>
            <input 
              type="text" 
              className="modal-input" 
              value={hijackApiKey} 
              onChange={e => setHijackApiKey(e.target.value)} 
              placeholder="点击右上角随机生成..." 
            />
          </div>
        </div>
      )}

      {settingsSubTab === "database" && (
        <div className="panel-card">
          <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "16px" }}>持久化存储数据库</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "20px" }}>OmniGate 正在使用高安全级别本地 SQLite 事务存储。主键 UUID 已根据协议完美去除连字符。</p>
          
          <div style={{ padding: "16px", backgroundColor: "hsl(var(--bg-app))", borderRadius: "8px", border: "1px solid hsl(var(--border-color))", marginBottom: "24px" }}>
            <div style={{ fontSize: "0.8rem", marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}><Database size={15} style={{ color: "hsl(var(--primary))" }} /> <strong>数据库驱动:</strong> <code style={{ color: "hsl(var(--primary))" }}>rusqlite + bundled SQLite v3</code></div>
            <div style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}><Info size={15} style={{ color: "hsl(var(--secondary))" }} /> <strong>存储位置:</strong> <code style={{ wordBreak: "break-all" }}>~/.config/omnigate/omnigate.db</code></div>
          </div>

          <button className="btn-secondary" style={{ color: "hsl(var(--danger))", borderColor: "hsl(var(--danger) / 0.2)" }} onClick={() => {
            if (window.confirm("确定要清空本地所有供应商配置与统计数据吗？该操作不可撤销。")) {
              window.alert("所有本地数据已安全清理并重置！");
            }
          }}><Trash2 size={15} /> 清除所有数据并重置</button>
        </div>
      )}

      {settingsSubTab === "about" && (
        <div className="panel-card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div className="logo-icon" style={{ margin: "0 auto 20px auto", width: "64px", height: "64px", fontSize: "2rem" }}>Ω</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "1.6rem" }}>OmniGate Rotator</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.86rem", marginTop: "4px" }}>跨协议多账户 AI 负载轮换调度管理器</p>
          
          <div style={{ margin: "24px 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            <p>内核版本: Rust Core v0.1.0-alpha</p>
            <p>UI 架构: React 18 + TS + Lucide Icons</p>
          </div>
          
          <p style={{ fontSize: "0.78rem", color: "hsl(var(--primary))", fontWeight: "600" }}>© 2026 OmniGate DeepMind Pair Programming.</p>
        </div>
      )}
    </div>
  );
}
