import React from "react";
import { Plus, AlertTriangle, FileText, Pin, Minus, Dices, BarChart2, Zap, Globe, Trash2 } from "lucide-react";
import { CustomSelect, Provider, ClientConfig } from "../../App";
import { invoke } from "@tauri-apps/api/core";

interface ClientConfigTabProps {
  clientSubTab: string;
  setClientSubTab: (tab: string) => void;
  clientConfigs: ClientConfig[];
  renderCliMask: (clientId: string) => React.ReactNode;
  handleToggleClient: (clientId: string) => void;
  handleStrategyChange: (clientId: string, strategy: string) => void;
  setAddingProviderForClient: (clientId: string | null) => void;
  providers: Provider[];
  handleMoveProvider: (clientId: string, pIndex: number, dir: number) => void;
  handleWeightChange: (clientId: string, providerId: string, weight: number) => void;
  showToast: (msg: string, type?: "success" | "error" | "warning" | "info") => void;
  handleToggleClientProvider: (clientId: string, providerId: string) => void;
  addingProviderForClient: string | null;
  addingProviderProtocol: string;
  setAddingProviderProtocol: (protocol: string) => void;
  addingProviderId: string;
  setAddingProviderId: (id: string) => void;
  setClientConfigs: React.Dispatch<React.SetStateAction<ClientConfig[]>>;
  hijackProviderName: string;
  setHijackProviderName: (name: string) => void;
  reapplyProxyConfig: (clientId: string) => Promise<void>;
}

const WeightInput = ({ value, onChange, disabled }: { value: number, onChange: (val: number) => void, disabled: boolean }) => {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid hsl(var(--border-color))", borderRadius: "6px", overflow: "hidden", backgroundColor: "hsl(var(--bg-card))", opacity: disabled ? 0.6 : 1 }}>
      <button 
        disabled={disabled || value <= 1} 
        onClick={() => onChange(value - 1)}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 6px", background: "hsl(var(--bg-card))", border: "none", color: "hsl(var(--text-secondary))", cursor: (disabled || value <= 1) ? "not-allowed" : "pointer" }}
      ><Minus size={12} /></button>
      <input 
        type="number" 
        value={value} 
        disabled={disabled}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          if (!isNaN(val)) onChange(val);
        }}
        onBlur={(e) => {
          const val = parseInt(e.target.value);
          if (isNaN(val) || val < 1) onChange(1);
        }}
        style={{ width: "32px", textAlign: "center", background: "transparent", border: "none", color: "hsl(var(--text-primary))", fontSize: "0.8rem", padding: "4px 0", outline: "none" }} 
      />
      <button 
        disabled={disabled} 
        onClick={() => onChange(value + 1)}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 6px", background: "hsl(var(--bg-card))", border: "none", color: "hsl(var(--text-secondary))", cursor: disabled ? "not-allowed" : "pointer" }}
      ><Plus size={12} /></button>
    </div>
  );
};

export function ClientConfigTab({
  clientSubTab,
  setClientSubTab,
  clientConfigs,
  renderCliMask,
  handleToggleClient,
  handleStrategyChange,
  setAddingProviderForClient,
  providers,
  handleMoveProvider,
  handleWeightChange,
  showToast,
  handleToggleClientProvider,
  addingProviderForClient,
  addingProviderProtocol,
  setAddingProviderProtocol,
  addingProviderId,
  setAddingProviderId,
  setClientConfigs,
  hijackProviderName,
  setHijackProviderName,
  reapplyProxyConfig
}: ClientConfigTabProps) {
  const [opencodeDirectList, setOpencodeDirectList] = React.useState<string[]>([]);
  
  const fetchOpencodeDirectProviders = async () => {
    try {
      const res = await invoke<string[]>("get_opencode_direct_providers");
      setOpencodeDirectList(res);
    } catch (err) {
      console.error("Failed to fetch opencode direct providers:", err);
    }
  };

  React.useEffect(() => {
    if (clientSubTab === "opencode") {
      fetchOpencodeDirectProviders();
    }
  }, [clientSubTab]);

  const handlePinProvider = (clientId: string, providerId: string) => {
    setClientConfigs(prev => prev.map(c => {
      if (c.client_id === clientId) {
        return { ...c, manual_provider_id: providerId };
      }
      return c;
    }));
  };

  const handleDirectProviderSelect = (clientId: string, providerId: string) => {
    setClientConfigs(prev => prev.map(c => {
      if (c.client_id === clientId) {
        return { ...c, direct_provider_id: providerId };
      }
      return c;
    }));
  };

  const handleToggleMode = async (clientId: string, mode: "proxy" | "direct") => {
    const config = clientConfigs.find(c => c.client_id === clientId);
    if (!config) return;

    setClientConfigs(prev => prev.map(c => {
      if (c.client_id === clientId) {
        return { 
          ...c, 
          operation_mode: mode
        };
      }
      return c;
    }));

    if (mode === "direct" && config.direct_provider_id) {
      if (clientId !== "opencode") {
        try {
          await invoke("apply_direct_config", {
            clientId: clientId,
            providerId: config.direct_provider_id
          });
          showToast("已自动应用直连配置！", "success");
        } catch (e: any) {
          showToast("自动写入直连配置失败: " + e, "error");
        }
      }
    } else if (mode === "proxy") {
      await reapplyProxyConfig(clientId);
      showToast("已恢复代理接管配置！", "success");
    }
  };

  return (
    <div>
      <div className="tabs-control-row">
        <button className={`tab-select-btn ${clientSubTab === "claude" ? "active" : ""}`} onClick={() => setClientSubTab("claude")}>Claude 客户端配置</button>
        <button className={`tab-select-btn ${clientSubTab === "codex" ? "active" : ""}`} onClick={() => setClientSubTab("codex")}>Codex 客户端配置</button>
        <button className={`tab-select-btn ${clientSubTab === "opencode" ? "active" : ""}`} onClick={() => setClientSubTab("opencode")}>OpenCode 客户端配置</button>
      </div>

      {/* ── Claude / Codex 通用渲染（过滤掉 opencode-* 子 ID）──  */}
      {clientSubTab !== "opencode" && clientConfigs.filter(c => c.client_id === clientSubTab).map((config, index) => (
        <div className="panel-card" key={index} style={{ position: "relative" }}>
          {renderCliMask(config.client_id)}
          <div className="card-header-row" style={{ borderBottom: "1px solid hsl(var(--border-color))", paddingBottom: "16px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <h3 style={{ textTransform: "capitalize", fontSize: "1.1rem", margin: 0 }}>{config.client_id} 配置管理</h3>
              {config.operation_mode !== "direct" && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "hsl(var(--bg-app))", padding: "4px 10px", borderRadius: "20px", border: "1px solid hsl(var(--border-color))" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: "600", color: config.is_enabled ? "hsl(var(--primary))" : "hsl(var(--text-muted))" }}>
                    {config.is_enabled ? "已启用接管" : "未启用"}
                  </span>
                  <div className="switch-container" onClick={() => handleToggleClient(config.client_id)}>
                    <div className={`switch-track ${config.is_enabled ? "active" : ""}`}>
                      <div className="switch-thumb"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="segmented-control">
              <div 
                className={`segmented-item ${config.operation_mode !== "direct" ? "active" : ""}`}
                onClick={() => handleToggleMode(config.client_id, "proxy")}
              >
                <Globe size={14} /> 代理接管
              </div>
              <div 
                className={`segmented-item ${config.operation_mode === "direct" ? "active" : ""}`}
                onClick={() => handleToggleMode(config.client_id, "direct")}
              >
                <Zap size={14} /> 直连写入
              </div>
            </div>
          </div>

          {config.operation_mode !== "direct" ? (

          <div className="priority-config-container">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "0.85rem", fontWeight: "600", margin: 0 }}>供应商轮换策略</h4>
              <div className="segmented-control">
                <div 
                  className={`segmented-item ${config.strategy === "random" ? "active" : ""}`}
                  onClick={() => handleStrategyChange(config.client_id, "random")}
                >
                  <Dices size={14} /> 随机 (负载均衡)
                </div>
                <div 
                  className={`segmented-item ${config.strategy === "priority" ? "active" : ""}`}
                  onClick={() => handleStrategyChange(config.client_id, "priority")}
                >
                  <BarChart2 size={14} style={{ transform: "rotate(90deg)" }} /> 优先级降序
                </div>
                <div 
                  className={`segmented-item ${config.strategy === "manual" ? "active" : ""}`}
                  onClick={() => handleStrategyChange(config.client_id, "manual")}
                >
                  <Pin size={14} /> 手动固定
                </div>
              </div>
            </div>

            <div>
              <div className="card-header-row" style={{ marginBottom: "10px" }}>
                <h4 style={{ fontSize: "0.88rem", fontWeight: "600" }}>供应商列表及权重分配</h4>
                <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.76rem" }} onClick={() => setAddingProviderForClient(config.client_id)}><Plus size={14} /> 添加新成员</button>
              </div>

              <div className="responsive-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40%" }}>供应商</th>
                      <th style={{ width: "15%", textAlign: "center" }}>运行状态</th>
                      <th style={{ width: "30%", textAlign: "center" }}>
                        {config.strategy === "random" && "轮换权重"}
                        {config.strategy === "manual" && "手动选择"}
                        {config.strategy === "priority" && "优先级调整"}
                      </th>
                      <th style={{ width: "15%", textAlign: "center" }}>启用状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.providers.map((p, pIndex) => {
                      // 查询全局供应商表，判断该供应商是否已被全局禁用
                      const globalProvider = providers.find(gp => gp.id === p.id);
                      const isGloballyDisabled = globalProvider ? !globalProvider.is_active : false;
                      const isPinned = config.strategy === "manual" && (config.manual_provider_id ? p.id === config.manual_provider_id : pIndex === 0);

                      return (
                        <tr key={pIndex} style={isGloballyDisabled ? { opacity: 0.5 } : (config.strategy === "manual" && !isPinned ? { opacity: 0.4 } : {})}>
                          <td style={{ fontWeight: "600" }}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              {p.name}
                              {isPinned && (
                                <span style={{ marginLeft: "8px", fontSize: "0.65rem", fontWeight: "normal", padding: "2px 6px", borderRadius: "4px", backgroundColor: "hsl(var(--primary))", color: "#fff" }}>当前手动选择</span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>{p.api_url}</div>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {isGloballyDisabled ? (
                              <span className="status-badge" style={{ backgroundColor: "hsl(var(--danger) / 0.15)", color: "hsl(var(--danger))", border: "1px solid hsl(var(--danger) / 0.3)" }}>
                                全局已禁用
                              </span>
                            ) : (
                              <span className="status-badge success">可用</span>
                            )}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {config.strategy === "priority" && (
                              <div style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                                <button
                                  className="btn-secondary"
                                  style={{ padding: "2px 4px", fontSize: "0.6rem" }}
                                  disabled={pIndex === 0 || isGloballyDisabled}
                                  onClick={() => handleMoveProvider(config.client_id, pIndex, -1)}
                                >↑</button>
                                <button
                                  className="btn-secondary"
                                  style={{ padding: "2px 4px", fontSize: "0.6rem" }}
                                  disabled={pIndex === config.providers.length - 1 || isGloballyDisabled}
                                  onClick={() => handleMoveProvider(config.client_id, pIndex, 1)}
                                >↓</button>
                              </div>
                            )}
                            {config.strategy === "random" && (
                              <WeightInput
                                value={p.weight}
                                disabled={isGloballyDisabled}
                                onChange={(val) => handleWeightChange(config.client_id, p.id, val)}
                              />
                            )}
                            {config.strategy === "manual" && (
                              <button
                                className="btn-secondary"
                                style={{ padding: "4px 8px", fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: "5px", opacity: isPinned ? 0.6 : 1 }}
                                disabled={isPinned || isGloballyDisabled}
                                onClick={() => handlePinProvider(config.client_id, p.id)}
                                title={isPinned ? "已设为当前手动选项" : "点击设为当前手动选项"}
                              >
                                <Pin size={11} style={{ transform: isPinned ? "rotate(0deg)" : "rotate(45deg)" }} />
                                {isPinned ? "已选定" : "选定此项"}
                              </button>
                            )}
                          </td>
                          <td style={{ width: "15%" }}>
                            <div style={{ display: "flex", justifyContent: "center" }}>
                              <div
                                className="switch-container"
                              style={{ cursor: isGloballyDisabled ? "not-allowed" : "pointer" }}
                              onClick={() => {
                                if (isGloballyDisabled) {
                                  showToast(`供应商「${p.name}」已在全局供应商管理中禁用，请先前往供应商管理页面重新启用。`, "warning");
                                  return;
                                }
                                handleToggleClientProvider(config.client_id, p.id);
                              }}
                            >
                                <div className={`switch-track ${p.is_active && !isGloballyDisabled ? "active" : ""}`}>
                                  <div className="switch-thumb"></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {addingProviderForClient === config.client_id && (
                      <tr>
                        <td colSpan={2}>
                          <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                            <div style={{ flex: "0 0 160px" }}>
                              <CustomSelect
                                value={addingProviderProtocol}
                                onChange={(v: string) => {
                                  setAddingProviderProtocol(v);
                                  setAddingProviderId("");
                                }}
                                options={[
                                  { label: "选择协议", value: "" },
                                  ...(config.client_id === "claude" ? [{ label: "Claude 协议", value: "claude" }] : []),
                                  ...(config.client_id === "codex" ? [{ label: "Codex /responses", value: "codex_responses" }] : []),
                                  ...(config.client_id === "opencode" ? [
                                    { label: "Claude 协议", value: "claude" },
                                    { label: "Codex /responses", value: "codex_responses" },
                                    { label: "Codex /chat", value: "codex_chat" }
                                  ] : [])
                                ]}
                              />
                            </div>
                            <div style={{ flex: "1" }}>
                              <CustomSelect
                                value={addingProviderId}
                                onChange={(v: string) => {
                                  setAddingProviderId(v);
                                  // 延迟执行添加，因为 setState 是异步的
                                  setTimeout(() => {
                                    if (v) {
                                      const provider = providers.find(p => p.id === v);
                                      if (provider) {
                                        setClientConfigs(prev => prev.map(c => {
                                          if (c.client_id === config.client_id) {
                                            if (c.providers.some(p => p.id === provider.id)) return c;
                                            return { ...c, providers: [...c.providers, { ...provider, weight: 1, is_active: true, priority: c.providers.length }] };
                                          }
                                          return c;
                                        }));
                                        setAddingProviderForClient(null);
                                        setAddingProviderProtocol("");
                                        setAddingProviderId("");
                                      }
                                    }
                                  }, 0);
                                }}
                                options={[
                                  { label: "请选择供应商...", value: "" },
                                  ...providers
                                    .filter(p => p.protocol === addingProviderProtocol && !config.providers.some(cp => cp.id === p.id))
                                    .map(p => ({ label: p.name, value: p.id }))
                                ]}
                              />
                            </div>
                          </div>
                        </td>
                        <td>-</td>
                        <td>
                          <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "0.72rem" }} onClick={() => setAddingProviderForClient(null)}>取消</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "16px" }}>
              <div className="form-group">
                <label>单点请求超时限制</label>
                <CustomSelect 
                  value={config.timeout_seconds} 
                  onChange={(v: string | number) => {
                    const newTimeout = Number(v);
                    setClientConfigs(prev => prev.map(c => c.client_id === config.client_id ? { ...c, timeout_seconds: newTimeout } : c));
                  }}
                  options={[
                    { value: 30, label: "30 秒" },
                    { value: 60, label: "60 秒" },
                    { value: 120, label: "120 秒" },
                    { value: 300, label: "300 秒" }
                  ]}
                />
              </div>
              <div className="form-group">
                <label>首选失败重试上限</label>
                <CustomSelect 
                  value={config.retry_count} 
                  onChange={(v: string | number) => {
                    const newRetry = Number(v);
                    setClientConfigs(prev => prev.map(c => c.client_id === config.client_id ? { ...c, retry_count: newRetry } : c));
                  }}
                  options={[
                    { value: 0, label: "不重试" },
                    { value: 1, label: "重试 1 次" },
                    { value: 2, label: "重试 2 次" },
                    { value: 3, label: "重试 3 次" }
                  ]}
                />
              </div>
              
              {config.client_id === "codex" && (
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Provider 名称 (model_provider)</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>自动读取: {hijackProviderName || "无"}</span>
                  </label>
                  <input 
                    type="text" 
                    className="modal-input" 
                    value={hijackProviderName} 
                    onChange={e => {
                      setHijackProviderName(e.target.value);
                      if (config.is_enabled) {
                        showToast("修改 Provider 名称后，必须重新关闭并开启上方「接管状态」才能在本地文件中生效！", "warning");
                      }
                    }} 
                    placeholder="custom" 
                  />
                  <div style={{ marginTop: "8px", padding: "8px 12px", backgroundColor: "hsl(var(--warning) / 0.1)", border: "1px solid hsl(var(--warning) / 0.3)", borderRadius: "6px" }}>
                    <span style={{ fontSize: "0.8rem", color: "hsl(var(--warning))", display: "flex", alignItems: "center", gap: "6px" }}>
                      <AlertTriangle size={14} /> <strong>警告：</strong>修改该项可能导致 Codex 历史会话丢失，强烈不建议修改。
                    </span>
                  </div>
                </div>
              )}

              {config.client_id === "opencode" && (
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <div style={{ padding: "12px 14px", backgroundColor: "hsl(var(--primary) / 0.06)", border: "1px solid hsl(var(--primary) / 0.2)", borderRadius: "8px" }}>
                    <div style={{ fontSize: "0.82rem", color: "hsl(var(--primary))", fontWeight: "600", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <FileText size={14} /> 接管后自动注入 3 个代理供应商
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                      <div style={{ padding: "8px 10px", backgroundColor: "hsl(var(--bg-card))", borderRadius: "6px", border: "1px solid hsl(var(--border-color))" }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "hsl(var(--primary))", marginBottom: "4px" }}>omnigate-claude</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: "1.4" }}>@ai-sdk/anthropic</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>/claude/v1 → Claude 协议供应商模型</div>
                      </div>
                      <div style={{ padding: "8px 10px", backgroundColor: "hsl(var(--bg-card))", borderRadius: "6px", border: "1px solid hsl(var(--border-color))" }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "hsl(var(--secondary))", marginBottom: "4px" }}>omnigate-resp</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: "1.4" }}>@ai-sdk/openai</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>/codex → Responses 协议供应商模型</div>
                      </div>
                      <div style={{ padding: "8px 10px", backgroundColor: "hsl(var(--bg-card))", borderRadius: "6px", border: "1px solid hsl(var(--border-color))" }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "hsl(var(--warning))", marginBottom: "4px" }}>omnigate-chat</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: "1.4" }}>@ai-sdk/openai-compatible</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>/opencode/v1 → Chat 协议供应商模型</div>
                      </div>
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      💡 配置变更后自动同步更新模型字典，无需手动重新接管
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid hsl(var(--border-color))", display: "flex", alignItems: "center", gap: "8px" }}>
              <FileText size={16} style={{ color: "var(--text-muted)" }} />
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                <strong>目标配置文件:</strong> <code style={{ backgroundColor: "hsl(var(--bg-app))", padding: "2px 6px", borderRadius: "4px" }}>{config.client_id === "claude" ? "~/.claude" : config.client_id === "codex" ? "~/.codex/config.toml" : "~/.config/opencode/opencode.json"}</code>
              </span>
            </div>

            </div>
          ) : (
            <div className="priority-config-container" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <h4 style={{ fontSize: "0.88rem", fontWeight: "600", marginBottom: "8px" }}>直连写入模式配置</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>请选择要直连的全局供应商。该供应商的连接信息将被直接硬写入目标客户端的配置文件中。</p>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "600", marginBottom: "6px", color: "hsl(var(--text-secondary))" }}>选择全局供应商</label>
                  <CustomSelect
                    value={config.direct_provider_id || ""}
                    onChange={(val) => handleDirectProviderSelect(config.client_id, val.toString())}
                    options={[
                      { value: "", label: "-- 请选择供应商 --" },
                      ...providers
                        .filter(p => {
                          if (config.client_id === "claude") return p.protocol === "claude";
                          if (config.client_id === "codex") return p.protocol === "codex_responses";
                          return true;
                        })
                        .map(p => ({ value: p.id, label: p.name }))
                    ]}
                  />
                </div>
                <button 
                  className="btn-primary" 
                  disabled={!config.direct_provider_id}
                  onClick={async () => {
                    try {
                      await invoke("apply_direct_config", {
                        clientId: config.client_id,
                        providerId: config.direct_provider_id
                      });
                      showToast("直连配置已写入，请重启该客户端以使配置生效！", "success");
                    } catch (e: any) {
                      showToast("写入直连配置失败: " + e, "error");
                    }
                  }}
                  style={{ padding: "10px 20px" }}
                >
                  <Zap size={16} style={{ marginRight: "6px" }} /> 应用直连配置
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* ── OpenCode 专属渲染（总开关 + 3 个协议子面板）── */}
      {clientSubTab === "opencode" && (() => {
        const masterCfg = clientConfigs.find(c => c.client_id === "opencode");
        const claudeCfg = clientConfigs.find(c => c.client_id === "opencode-claude");
        const respCfg   = clientConfigs.find(c => c.client_id === "opencode-resp");
        const chatCfg   = clientConfigs.find(c => c.client_id === "opencode-chat");
        if (!masterCfg) return null;

        // 通用：供应商列表 + 策略面板渲染函数
        const renderProviderPanel = (cfg: ClientConfig, label: string, protocol: string, accentColor: string, routeHint: string) => {
          if (!cfg) return null;
          return (
            <div className="panel-card" style={{ marginTop: "16px" }}>
              <div className="card-header-row" style={{ borderBottom: "1px solid hsl(var(--border-color))", paddingBottom: "12px", marginBottom: "16px" }}>
                <div>
                  <h4 style={{ fontSize: "1rem", fontWeight: "700", color: accentColor }}>{label}</h4>
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>代理路由: <code style={{ backgroundColor: "hsl(var(--bg-app))", padding: "1px 5px", borderRadius: "3px" }}>http://127.0.0.1:3456{routeHint}</code>　→　此分组的供应商独立路由计划</p>
                </div>
              </div>

              {/* 策略 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <h5 style={{ fontSize: "0.82rem", fontWeight: "600", margin: 0 }}>供应商轮换策略</h5>
                <div className="segmented-control">
                  <div 
                    className={`segmented-item ${cfg.strategy === "random" ? "active" : ""}`}
                    onClick={() => handleStrategyChange(cfg.client_id, "random")}
                  >
                    <Dices size={14} /> 随机 (负载均衡)
                  </div>
                  <div 
                    className={`segmented-item ${cfg.strategy === "priority" ? "active" : ""}`}
                    onClick={() => handleStrategyChange(cfg.client_id, "priority")}
                  >
                    <BarChart2 size={14} style={{ transform: "rotate(90deg)" }} /> 优先级降序
                  </div>
                  <div 
                    className={`segmented-item ${cfg.strategy === "manual" ? "active" : ""}`}
                    onClick={() => handleStrategyChange(cfg.client_id, "manual")}
                  >
                    <Pin size={14} /> 手动固定
                  </div>
                </div>
              </div>

              {/* 供应商列表 */}
              <div>
                <div className="card-header-row" style={{ marginBottom: "10px" }}>
                  <h5 style={{ fontSize: "0.82rem", fontWeight: "600" }}>供应商列表及权重分配</h5>
                  <button className="btn-secondary" style={{ padding: "5px 10px", fontSize: "0.72rem" }} onClick={() => {
                    setAddingProviderProtocol(protocol);
                    setAddingProviderForClient(cfg.client_id);
                  }}><Plus size={13} /> 添加新成员</button>
                </div>
                <div className="responsive-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: "40%" }}>供应商</th>
                        <th style={{ width: "15%", textAlign: "center" }}>运行状态</th>
                        <th style={{ width: "30%", textAlign: "center" }}>
                          {cfg.strategy === "random" && "轮换权重"}
                          {cfg.strategy === "manual" && "手动选择"}
                          {cfg.strategy === "priority" && "优先级调整"}
                        </th>
                        <th style={{ width: "15%", textAlign: "center" }}>启用状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cfg.providers.map((p, pIndex) => {
                        const globalProvider = providers.find(gp => gp.id === p.id);
                        const isGloballyDisabled = globalProvider ? !globalProvider.is_active : false;
                        const isPinned = cfg.strategy === "manual" && (cfg.manual_provider_id ? p.id === cfg.manual_provider_id : pIndex === 0);
                        return (
                          <tr key={pIndex} style={isGloballyDisabled ? { opacity: 0.5 } : (cfg.strategy === "manual" && !isPinned ? { opacity: 0.4 } : {})}>
                            <td style={{ fontWeight: "600" }}>
                              <div style={{ display: "flex", alignItems: "center" }}>
                                {p.name}
                                {isPinned && (
                                  <span style={{ marginLeft: "8px", fontSize: "0.65rem", fontWeight: "normal", padding: "2px 6px", borderRadius: "4px", backgroundColor: "hsl(var(--primary))", color: "#fff" }}>当前手动选择</span>
                                )}
                              </div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>{p.api_url}</div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {isGloballyDisabled ? (
                                <span className="status-badge" style={{ backgroundColor: "hsl(var(--danger) / 0.15)", color: "hsl(var(--danger))", border: "1px solid hsl(var(--danger) / 0.3)" }}>全局已禁用</span>
                              ) : (<span className="status-badge success">可用</span>)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {cfg.strategy === "priority" && (
                                <div style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                                  <button className="btn-secondary" style={{ padding: "2px 4px", fontSize: "0.6rem" }} disabled={pIndex === 0 || isGloballyDisabled} onClick={() => handleMoveProvider(cfg.client_id, pIndex, -1)}>↑</button>
                                  <button className="btn-secondary" style={{ padding: "2px 4px", fontSize: "0.6rem" }} disabled={pIndex === cfg.providers.length - 1 || isGloballyDisabled} onClick={() => handleMoveProvider(cfg.client_id, pIndex, 1)}>↓</button>
                                </div>
                              )}
                              {cfg.strategy === "random" && (
                                <WeightInput
                                  value={p.weight}
                                  disabled={isGloballyDisabled}
                                  onChange={(val) => handleWeightChange(cfg.client_id, p.id, val)}
                                />
                              )}
                              {cfg.strategy === "manual" && (
                                <button
                                  className="btn-secondary"
                                  style={{ padding: "4px 8px", fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: "5px", opacity: isPinned ? 0.6 : 1 }}
                                  disabled={isPinned || isGloballyDisabled}
                                  onClick={() => handlePinProvider(cfg.client_id, p.id)}
                                  title={isPinned ? "已设为当前手动选项" : "点击设为当前手动选项"}
                                >
                                  <Pin size={11} style={{ transform: isPinned ? "rotate(0deg)" : "rotate(45deg)" }} />
                                  {isPinned ? "已选定" : "选定此项"}
                                </button>
                              )}
                            </td>
                            <td style={{ width: "15%" }}>
                              <div style={{ display: "flex", justifyContent: "center" }}>
                                <div className="switch-container" style={{ cursor: isGloballyDisabled ? "not-allowed" : "pointer" }}
                                  onClick={() => {
                                    if (isGloballyDisabled) {
                                      showToast(`供应商「${p.name}」已在全局供应商管理中禁用，请先前往供应商管理页面重新启用。`, "warning");
                                      return;
                                    }
                                    handleToggleClientProvider(cfg.client_id, p.id);
                                  }}>
                                  <div className={`switch-track ${p.is_active && !isGloballyDisabled ? "active" : ""}`}>
                                    <div className="switch-thumb"></div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {addingProviderForClient === cfg.client_id && (
                        <tr>
                          <td colSpan={2}>
                            <CustomSelect
                              value={addingProviderId}
                              onChange={(v: string) => {
                                setAddingProviderId(v);
                                setTimeout(() => {
                                  if (v) {
                                    const provider = providers.find(p => p.id === v);
                                    if (provider) {
                                      setClientConfigs(prev => prev.map(c => {
                                        if (c.client_id === cfg.client_id) {
                                          if (c.providers.some(p => p.id === provider.id)) return c;
                                          return { ...c, providers: [...c.providers, { ...provider, weight: 1, is_active: true, priority: c.providers.length }] };
                                        }
                                        return c;
                                      }));
                                      setAddingProviderForClient(null);
                                      setAddingProviderProtocol("");
                                      setAddingProviderId("");
                                    }
                                  }
                                }, 0);
                              }}
                              options={[
                                { label: "请选择供应商...", value: "" },
                                ...providers
                                  .filter(p => p.protocol === protocol && !cfg.providers.some(cp => cp.id === p.id))
                                  .map(p => ({ label: p.name, value: p.id }))
                              ]}
                            />
                          </td>
                          <td>-</td>
                          <td><button className="btn-secondary" style={{ padding: "3px 7px", fontSize: "0.7rem" }} onClick={() => setAddingProviderForClient(null)}>取消</button></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 超时/重试 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "14px" }}>
                <div className="form-group">
                  <label>单点请求超时限制</label>
                  <CustomSelect value={cfg.timeout_seconds} onChange={(v: string | number) => setClientConfigs(prev => prev.map(c => c.client_id === cfg.client_id ? { ...c, timeout_seconds: Number(v) } : c))}
                    options={[{ value: 30, label: "30 秒" }, { value: 60, label: "60 秒" }, { value: 120, label: "120 秒" }, { value: 300, label: "300 秒" }]} />
                </div>
                <div className="form-group">
                  <label>首选失败重试上限</label>
                  <CustomSelect value={cfg.retry_count} onChange={(v: string | number) => setClientConfigs(prev => prev.map(c => c.client_id === cfg.client_id ? { ...c, retry_count: Number(v) } : c))}
                    options={[{ value: 0, label: "不重试" }, { value: 1, label: "重试 1 次" }, { value: 2, label: "重试 2 次" }, { value: 3, label: "重试 3 次" }]} />
                </div>
              </div>
            </div>
          );
        };

        return (
          <div style={{ position: "relative" }}>
            {renderCliMask("opencode")}
            {/* 总开关卡片 */}
            <div className="panel-card">
              <div className="card-header-row" style={{ borderBottom: "1px solid hsl(var(--border-color))", paddingBottom: "16px", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "1.2rem" }}>OpenCode 配置管理</h3>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    {masterCfg.operation_mode === "proxy" ? "视图：管理 OmniGate 内部转发的 3 个代理节点配置（支持负载均衡）" : "视图：管理向 OpenCode 配置文件中直接写入的外部节点"}
                    <span style={{ color: "hsl(var(--primary))", marginLeft: "8px", fontWeight: "500" }}>💡 双轨并存：代理与直连节点可同时生效</span>
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", borderRight: "1px solid hsl(var(--border-color))", paddingRight: "20px" }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: "600" }}>代理接管:</span>
                    <div className="switch-container" onClick={() => handleToggleClient("opencode")}>
                      <div className={`switch-track ${masterCfg.is_enabled ? "active" : ""}`}>
                        <div className="switch-thumb"></div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "hsl(var(--bg-secondary) / 0.5)", padding: "4px", borderRadius: "8px", border: "1px solid hsl(var(--border-color))" }}>
                    <button
                      style={{ 
                        padding: "6px 14px", fontSize: "0.8rem", margin: 0, borderRadius: "6px", display: "flex", alignItems: "center", border: "none", cursor: "pointer", transition: "all 0.2s",
                        background: masterCfg.operation_mode !== "direct" ? "hsl(var(--primary))" : "transparent",
                        color: masterCfg.operation_mode !== "direct" ? "white" : "hsl(var(--text-secondary))",
                        fontWeight: masterCfg.operation_mode !== "direct" ? "600" : "500",
                        boxShadow: masterCfg.operation_mode !== "direct" ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
                      }}
                      onClick={() => handleToggleMode(masterCfg.client_id, "proxy")}
                    >
                      <Globe size={14} style={{ marginRight: "4px" }} /> 代理接管
                    </button>
                    <button
                      style={{ 
                        padding: "6px 14px", fontSize: "0.8rem", margin: 0, borderRadius: "6px", display: "flex", alignItems: "center", border: "none", cursor: "pointer", transition: "all 0.2s",
                        background: masterCfg.operation_mode === "direct" ? "hsl(var(--primary))" : "transparent",
                        color: masterCfg.operation_mode === "direct" ? "white" : "hsl(var(--text-secondary))",
                        fontWeight: masterCfg.operation_mode === "direct" ? "600" : "500",
                        boxShadow: masterCfg.operation_mode === "direct" ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
                      }}
                      onClick={() => handleToggleMode(masterCfg.client_id, "direct")}
                    >
                      <Zap size={14} style={{ marginRight: "4px" }} /> 直连写入
                    </button>
                  </div>
                </div>
              </div>
              {/* 注入说明 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                {[
                  { key: "omnigate-claude", npm: "@ai-sdk/anthropic",        route: "/opencode/claude",    color: "hsl(var(--primary))",   label: "Claude 协议" },
                  { key: "omnigate-resp",   npm: "@ai-sdk/openai",           route: "/opencode/responses", color: "hsl(var(--secondary))", label: "Responses 协议" },
                  { key: "omnigate-chat",   npm: "@ai-sdk/openai-compatible", route: "/opencode/chat",      color: "hsl(var(--warning))",   label: "Chat 协议" },
                ].map(item => (
                  <div key={item.key} style={{ padding: "10px 12px", backgroundColor: "hsl(var(--bg-app))", borderRadius: "7px", border: "1px solid hsl(var(--border-color))" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: "700", color: item.color, marginBottom: "4px" }}>{item.key}</div>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{item.npm}</div>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{item.route} → {item.label}供应商</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "10px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                💡 配置变更后自动同步更新模型字典，无需手动重新接管
              </div>
            </div>

            {masterCfg.operation_mode !== "direct" ? (
              <>
                {/* 3 个独立协议子面板 */}
                {claudeCfg && renderProviderPanel(claudeCfg, "供应商列表及权重分配（Claude 协议）", "claude", "hsl(var(--primary))", "/opencode/claude")}
                {respCfg   && renderProviderPanel(respCfg,   "供应商列表及权重分配（Responses 协议）", "codex_responses", "hsl(var(--secondary))", "/opencode/responses")}
                {chatCfg   && renderProviderPanel(chatCfg,   "供应商列表及权重分配（Chat 协议）", "codex_chat", "hsl(var(--warning))", "/opencode/chat")}
              </>
            ) : (
              <div className="panel-card" style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <h4 style={{ fontSize: "0.88rem", fontWeight: "600", marginBottom: "8px" }}>直连写入模式配置</h4>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>请选择要直连的全局供应商并添加。配置将被直接写入 OpenCode 配置文件中（支持多供应商共存）。</p>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "600", marginBottom: "6px", color: "hsl(var(--text-secondary))" }}>选择全局供应商</label>
                    <CustomSelect
                      value={addingProviderId}
                      onChange={(val) => setAddingProviderId(val.toString())}
                      options={[
                        { value: "", label: "-- 请选择要添加的直连供应商 --" },
                        ...providers.map(p => ({ value: p.id, label: p.name }))
                      ]}
                    />
                  </div>
                  <button 
                    className="btn-primary" 
                    disabled={!addingProviderId}
                    onClick={async () => {
                      try {
                        await invoke("apply_direct_config", {
                          clientId: "opencode",
                          providerId: addingProviderId
                        });
                        showToast("直连供应商已添加至 OpenCode！", "success");
                        setAddingProviderId("");
                        fetchOpencodeDirectProviders();
                      } catch (e: any) {
                        showToast("添加直连配置失败: " + e, "error");
                      }
                    }}
                    style={{ padding: "10px 20px" }}
                  >
                    <Plus size={16} style={{ marginRight: "6px" }} /> 添加直连节点
                  </button>
                </div>

                {/* 已经添加的直连节点列表 */}
                {opencodeDirectList.length > 0 && (
                  <div style={{ marginTop: "16px" }}>
                    <h5 style={{ fontSize: "0.82rem", fontWeight: "600", marginBottom: "10px", color: "hsl(var(--text-secondary))" }}>已添加的直连供应商节点</h5>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {opencodeDirectList.map(providerId => {
                        const pName = providers.find(p => p.id === providerId)?.name || providerId;
                        const displayName = `OmniGate-Provider(${pName})`;
                        return (
                          <div key={providerId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", backgroundColor: "hsl(var(--bg-app))", borderRadius: "8px", border: "1px solid hsl(var(--border-color))" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <Globe size={15} style={{ color: "hsl(var(--success))" }} />
                              <span style={{ fontSize: "0.85rem", fontWeight: "600" }}>{displayName}</span>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  await invoke("remove_opencode_direct_provider", { providerId });
                                  showToast("直连供应商已移除", "info");
                                  fetchOpencodeDirectProviders();
                                } catch (e: any) {
                                  showToast("移除失败: " + e, "error");
                                }
                              }}
                              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px", fontSize: "0.75rem", color: "hsl(var(--error))", background: "transparent", border: "1px solid hsl(var(--error) / 0.3)", borderRadius: "6px", cursor: "pointer", transition: "all 0.2s" }}
                            >
                              <Trash2 size={12} /> 移除
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}
