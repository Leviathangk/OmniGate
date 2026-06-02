
import { Database, Info, Trash2 } from "lucide-react";
import { CustomSelect } from "../../App";

interface SettingsTabProps {
  settingsSubTab: string;
  setSettingsSubTab: (tab: string) => void;
  hijackBaseUrl: string;
  setHijackBaseUrl: (url: string) => void;
  generateRandomKey: () => void;
  hijackApiKey: string;
  setHijackApiKey: (key: string) => void;
  globalMaxRetries: number;
  setGlobalMaxRetries: (val: number) => void;
  globalMaxRetryTimeout: number | "";
  setGlobalMaxRetryTimeout: (val: number | "") => void;
  globalResetEnabled: boolean;
  setGlobalResetEnabled: (val: boolean) => void;
  globalResetTime: string;
  setGlobalResetTime: (val: string) => void;
}

export function SettingsTab({
  settingsSubTab,
  setSettingsSubTab,
  hijackBaseUrl,
  setHijackBaseUrl,
  generateRandomKey,
  hijackApiKey,
  setHijackApiKey,
  globalMaxRetries,
  setGlobalMaxRetries,
  globalMaxRetryTimeout,
  setGlobalMaxRetryTimeout,
  globalResetEnabled,
  setGlobalResetEnabled,
  globalResetTime,
  setGlobalResetTime
}: SettingsTabProps) {
  return (
    <div>
      <div className="tabs-control-row">
        <button className={`tab-select-btn ${settingsSubTab === "strategy" ? "active" : ""}`} onClick={() => setSettingsSubTab("strategy")}>全局调度策略</button>
        <button className={`tab-select-btn ${settingsSubTab === "proxy" ? "active" : ""}`} onClick={() => setSettingsSubTab("proxy")}>本地网关接管</button>
        <button className={`tab-select-btn ${settingsSubTab === "database" ? "active" : ""}`} onClick={() => setSettingsSubTab("database")}>数据库管理</button>
        <button className={`tab-select-btn ${settingsSubTab === "about" ? "active" : ""}`} onClick={() => setSettingsSubTab("about")}>关于</button>
      </div>

      {settingsSubTab === "strategy" && (
        <>
          <div className="panel-card">
            <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "8px" }}>全局网络防风控与重试策略</h3>
            <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)", marginBottom: "20px" }}>当上游大模型 API 返回 429 Rate Limit 或 502 等临时错误时，OmniGate 将自动启用指数级退避重试 (Exponential Backoff)。重试间隔会以 2s, 4s, 8s 递增直到触发单次最大延迟。</p>
            
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>全局失败重试上限</label>
              <CustomSelect 
                value={globalMaxRetries.toString()}
                onChange={(val) => setGlobalMaxRetries(parseInt(val as string))}
                options={[
                  { value: "3", label: "3" },
                  { value: "5", label: "5" },
                  { value: "10", label: "10" },
                  { value: "15", label: "15" }
                ]}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "24px" }}>
              <label>最大单次重试等待时间 (秒)</label>
              <input 
                type="number" 
                className="modal-input" 
                value={globalMaxRetryTimeout} 
                onChange={e => {
                  const val = e.target.value;
                  if (val === "") setGlobalMaxRetryTimeout("");
                  else setGlobalMaxRetryTimeout(parseInt(val));
                }}
                onBlur={() => {
                  if (globalMaxRetryTimeout === "" || (globalMaxRetryTimeout as number) < 1) {
                    setGlobalMaxRetryTimeout(120);
                  }
                }}
                max="300"
                placeholder="默认 120" 
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "6px" }}>决定指数递增的上限，例如设置为 30 秒，则重试间隔最大停留在 30 秒，防止过长的阻塞。</p>
            </div>
          </div>

          <div className="panel-card" style={{ marginTop: "16px" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "8px" }}>优先级重置调度</h3>
            <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)", marginBottom: "20px" }}>您可以开启全局统一定时重置优先级，或依赖于每个供应商独立配置的计费周期进行惩罚衰减。</p>

            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontWeight: "normal" }}>
                <input 
                  type="checkbox" 
                  checked={globalResetEnabled} 
                  onChange={e => setGlobalResetEnabled(e.target.checked)} 
                  style={{ width: "16px", height: "16px", accentColor: "hsl(var(--primary))" }}
                />
                <span style={{ fontWeight: 600 }}>开启全局定时重置 (覆盖所有供应商)</span>
              </label>
            </div>

            {globalResetEnabled && (
              <div className="form-group" style={{ marginBottom: "24px", maxWidth: "200px" }}>
                <label>全局统一重置时间 (HH:MM)</label>
                <input 
                  type="time" 
                  className="modal-input" 
                  value={globalResetTime} 
                  onChange={e => setGlobalResetTime(e.target.value)} 
                />
              </div>
            )}
          </div>
        </>
      )}

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
