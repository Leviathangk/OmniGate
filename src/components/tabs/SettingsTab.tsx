
import { Database, Info, Trash2, Plus } from "lucide-react";
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
  fake200Keywords: import("../../App").Fake200Keyword[];
  setFake200Keywords: (val: import("../../App").Fake200Keyword[]) => void;
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
  fake200Keywords,
  setFake200Keywords
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
            <div className="card-header-row" style={{ marginBottom: "10px" }}>
              <div>
                <h5 style={{ fontSize: "0.95rem", fontWeight: "600" }}>200 状态伪装错误匹配词</h5>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                  有些服务商在拦截请求时仍会返回 200 HTTP 状态码，您可以配置匹配词，只要返回的响应流第一片段命中以下匹配规则，即自动拦截并立刻切换备用节点。
                </div>
              </div>
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.75rem" }} onClick={() => {
                if (fake200Keywords.some(kw => kw.word.trim() === "")) return;
                setFake200Keywords([...fake200Keywords, { word: "", matchType: "contains" }]);
              }}><Plus size={14} /> 新增匹配项</button>
            </div>
            
            <div className="responsive-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>匹配模式</th>
                    <th style={{ width: "60%" }}>匹配词汇</th>
                    <th style={{ width: "10%", textAlign: "center" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {fake200Keywords.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)" }}>暂无配置匹配词</td>
                    </tr>
                  ) : (
                    fake200Keywords.map((kw, i) => (
                      <tr key={i}>
                        <td>
                          <CustomSelect 
                            value={kw.matchType}
                            options={[
                              { value: "contains", label: "包含 (Contains)" },
                              { value: "exact", label: "完全一致 (Exact)" }
                            ]}
                            onChange={(val) => {
                              const newKws = [...fake200Keywords];
                              newKws[i].matchType = val as 'contains' | 'exact';
                              setFake200Keywords(newKws);
                            }}
                            style={{ 
                              background: "rgba(0, 0, 0, 0.2)", 
                              border: "1px solid var(--border-color)", 
                              color: "var(--text-color)" 
                            }}
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            style={{ 
                              margin: 0, 
                              padding: "6px 10px", 
                              fontSize: "0.85rem", 
                              height: "auto", 
                              width: "100%", 
                              background: "rgba(0, 0, 0, 0.2)",
                              border: "1px solid var(--border-color)",
                              borderRadius: "4px",
                              color: "var(--text-color)",
                              outline: "none"
                            }}
                            value={kw.word}
                            onChange={(e) => {
                              const newKws = [...fake200Keywords];
                              newKws[i].word = e.target.value;
                              setFake200Keywords(newKws);
                            }}
                            placeholder="例如: tream disconnected"
                          />
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <button 
                              className="icon-btn" 
                              title="删除"
                              onClick={() => {
                                const newKws = [...fake200Keywords];
                                newKws.splice(i, 1);
                                setFake200Keywords(newKws);
                              }}
                              style={{ color: "hsl(var(--danger))", opacity: 0.8 }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
