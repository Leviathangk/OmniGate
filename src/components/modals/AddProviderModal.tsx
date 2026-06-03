import React from "react";
import { Sparkles, Activity, Terminal, Share2, Info, ChevronRight, Check, RotateCw } from "lucide-react";
import { Model, getUrlPreview, renderModelPullingInterface, CustomSelect } from "../../App";

interface AddProviderModalProps {
  showAddProviderModal: boolean;
  setShowAddProviderModal: (show: boolean) => void;
  wizardStep: number;
  setWizardStep: (step: number) => void;
  newProvName: string;
  setNewProvName: (name: string) => void;
  newProvUrl: string;
  setNewProvUrl: (url: string) => void;
  newProvProtocol: string;
  setNewProvProtocol: (protocol: string) => void;
  newProvKey: string;
  setNewProvKey: (key: string) => void;
  newProvBillingType: string;
  setNewProvBillingType: (type: string) => void;
  newProvResetTime: string;
  setNewProvResetTime: (time: string) => void;
  isFetchingModels: boolean;
  fetchModelsError: string | null;
  setFetchModelsError: (error: string | null) => void;
  handleFetchModels: () => void;
  handleSaveProviderOnly: () => void;
  fetchedModels: Model[];
  wizardSearchQuery: string;
  setWizardSearchQuery: (query: string) => void;
  wizardFeatureTab: string;
  setWizardFeatureTab: (tab: string) => void;
  selectedFetchedModelNames: string[];
  setSelectedFetchedModelNames: React.Dispatch<React.SetStateAction<string[]>>;
  handleAddProviderSubmit: () => void;
}

export function AddProviderModal({
  showAddProviderModal,
  setShowAddProviderModal,
  wizardStep,
  setWizardStep,
  newProvName,
  setNewProvName,
  newProvUrl,
  setNewProvUrl,
  newProvProtocol,
  setNewProvProtocol,
  newProvKey,
  setNewProvKey,
  newProvBillingType,
  setNewProvBillingType,
  newProvResetTime,
  setNewProvResetTime,
  isFetchingModels,
  fetchModelsError,
  setFetchModelsError,
  handleFetchModels,
  handleSaveProviderOnly,
  fetchedModels,
  wizardSearchQuery,
  setWizardSearchQuery,
  wizardFeatureTab,
  setWizardFeatureTab,
  selectedFetchedModelNames,
  setSelectedFetchedModelNames,
  handleAddProviderSubmit
}: AddProviderModalProps) {
  if (!showAddProviderModal) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content-window">
        <header className="modal-header-section">
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><Sparkles size={18} style={{ color: "hsl(var(--primary))" }} /> 新增大模型供应商配置</h3>
          <button className="modal-close-btn" onClick={() => setShowAddProviderModal(false)}>✕</button>
        </header>

        <div className="modal-body-section">
          {/* 向导进度条 */}
          <div className="wizard-stepper">
            <div className={`step-item ${wizardStep === 1 ? "active" : ""} ${wizardStep > 1 ? "completed" : ""}`}>
              <span className="step-num">{wizardStep > 1 ? "✓" : "1"}</span>
              <span>基本信息</span>
            </div>
            <div className={`step-item ${wizardStep === 2 ? "active" : ""} ${wizardStep > 2 ? "completed" : ""}`}>
              <span className="step-num">{wizardStep > 2 ? "✓" : "2"}</span>
              <span>获取模型</span>
            </div>
            <div className={`step-item ${wizardStep === 3 ? "active" : ""} ${wizardStep > 3 ? "completed" : ""}`}>
              <span className="step-num">{wizardStep > 3 ? "✓" : "3"}</span>
              <span>选择模型</span>
            </div>
            <div className={`step-item ${wizardStep === 4 ? "active" : ""}`}>
              <span className="step-num">4</span>
              <span>完成</span>
            </div>
          </div>

          {/* 步骤 1：录入 API 配置与协议选择 */}
          {wizardStep === 1 && (
            <div className="wizard-layout">
              <div className="left-step-col">
                <div className="form-group">
                  <label>供应商名称</label>
                  <input placeholder="e.g. Anthropic Claude" value={newProvName} onChange={(e) => setNewProvName(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>API 基础地址 (API URL)</label>
                  <input placeholder="e.g. https://api.anthropic.com" value={newProvUrl} onChange={(e) => setNewProvUrl(e.target.value)} style={{ marginBottom: "4px" }} />
                  {newProvUrl.trim() && (() => {
                    const { discover, forward } = getUrlPreview(newProvUrl, newProvProtocol);
                    return (
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "4px", marginTop: "2px", lineHeight: "1.4" }}>
                        <div><span style={{ opacity: 0.6 }}>发现端点：</span><code style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>{discover}</code></div>
                        <div><span style={{ opacity: 0.6 }}>对话转发：</span><code style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>{forward}</code></div>
                      </div>
                    );
                  })()}
                </div>

                <div className="form-group">
                  <label>API 授权密钥 (API Key)</label>
                  <input type="password" placeholder="sk-..." value={newProvKey} onChange={(e) => setNewProvKey(e.target.value)} />
                </div>
                
                <div style={{ display: "flex", gap: "12px" }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>计费类型</label>
                    <CustomSelect 
                      value={newProvBillingType} 
                      onChange={(val) => {
                        const v = val as string;
                        setNewProvBillingType(v);
                        if (v === "pay_as_you_go") setNewProvResetTime("1");
                        else setNewProvResetTime("00:00");
                      }}
                      options={[
                        { value: "pay_as_you_go", label: "周期制" },
                        { value: "subscription", label: "订阅制" }
                      ]}
                    />
                  </div>
                  {newProvBillingType === "subscription" && (
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>重置时间 (HH:MM)</label>
                      <input type="time" value={newProvResetTime} onChange={(e) => setNewProvResetTime(e.target.value)} />
                    </div>
                  )}
                  {newProvBillingType === "pay_as_you_go" && (
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>重置周期 (小时)</label>
                      <input 
                        type="number" 
                        min="1" max="720" 
                        value={newProvResetTime} 
                        onChange={(e) => setNewProvResetTime(e.target.value)}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (isNaN(val) || val < 1) {
                            setNewProvResetTime("1");
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="right-step-col">
                <label style={{ fontSize: "0.8rem", fontWeight: "600", color: "hsl(var(--text-secondary))", display: "block", marginBottom: "8px" }}>协议类型选择</label>
                <div className="protocol-grid">
                  <div className={`protocol-card ${newProvProtocol === "claude" ? "active" : ""}`} onClick={() => setNewProvProtocol("claude")} style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span style={{ fontSize: "1.3rem", display: "flex", alignItems: "center", color: "hsl(var(--primary))" }}><Activity size={18} /></span>
                    <div>
                      <h4>Claude 协议</h4>
                      <p>协议组：兼容 Anthropic 原生消息请求格式</p>
                    </div>
                  </div>
                  <div className={`protocol-card ${newProvProtocol === "codex_responses" ? "active" : ""}`} onClick={() => setNewProvProtocol("codex_responses")} style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span style={{ fontSize: "1.3rem", display: "flex", alignItems: "center", color: "hsl(var(--secondary))" }}><Terminal size={18} /></span>
                    <div>
                      <h4>Codex /responses 协议</h4>
                      <p>协议组：兼容 Copilot Responses 物理转发</p>
                    </div>
                  </div>
                  <div className={`protocol-card ${newProvProtocol === "codex_chat" ? "active" : ""}`} onClick={() => setNewProvProtocol("codex_chat")} style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span style={{ fontSize: "1.3rem", display: "flex", alignItems: "center", color: "hsl(var(--success))" }}><Share2 size={18} /></span>
                    <div>
                      <h4>Codex /chat 协议</h4>
                      <p>协议组：兼容 OpenAI Chat Completions 规范</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 步骤 2：获取模型状态 */}
          {wizardStep === 2 && (
            <div>
              {isFetchingModels ? (
                <div style={{ padding: "40px 0", textAlign: "center" }}>
                  <h4 style={{ marginBottom: "16px", color: "hsl(var(--primary))" }}>正在从 {newProvUrl}/models 获取可用大模型矩阵...</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "600px", margin: "0 auto" }}>
                    <div className="skeleton-row"></div>
                    <div className="skeleton-row"></div>
                    <div className="skeleton-row"></div>
                    <div className="skeleton-row"></div>
                  </div>
                </div>
              ) : fetchModelsError ? (
                <div style={{ padding: "30px 24px", borderRadius: "12px", border: "1px solid hsl(var(--danger) / 0.2)", backgroundColor: "hsl(var(--danger) / 0.05)", color: "hsl(var(--danger))", display: "flex", flexDirection: "column", gap: "14px", maxWidth: "620px", margin: "20px auto" }}>
                  <div style={{ display: "flex", alignItems: "start", gap: "12px" }}>
                    <Info size={20} style={{ flexShrink: 0, marginTop: "2px", color: "hsl(var(--danger))" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: 1 }}>
                      <h4 style={{ fontWeight: 700, fontSize: "0.95rem", color: "hsl(var(--text-primary))", margin: 0 }}>获取模型接口失败 / 超时</h4>
                      <p style={{ fontSize: "0.78rem", color: "hsl(var(--text-secondary))", lineHeight: "1.5", margin: 0 }}>
                        部分中转代理或专用网关不提供标准的 `/models` 发现接口。您可以选择直接完成供应商创建，稍后可在模型列表中手动添加模型。
                      </p>
                      <div style={{ fontSize: "0.74rem", fontFamily: "var(--font-mono)", backgroundColor: "rgba(0,0,0,0.15)", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)", color: "hsl(var(--text-primary))", marginTop: "10px", wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
                        错误详情：{fetchModelsError}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "14px", marginTop: "4px" }}>
                    <button className="btn-secondary" onClick={() => { setWizardStep(1); setFetchModelsError(null); }} style={{ padding: "0 14px", height: "36px", fontSize: "0.8rem", borderRadius: "8px" }}>
                      返回修改 API 信息
                    </button>
                    <button className="btn-secondary" onClick={handleFetchModels} style={{ padding: "0 14px", height: "36px", fontSize: "0.8rem", borderRadius: "8px", borderColor: "hsl(var(--primary) / 0.3)", color: "hsl(var(--primary))" }}>
                      重试获取
                    </button>
                    <button className="btn-primary" onClick={handleSaveProviderOnly} style={{ padding: "0 14px", height: "36px", fontSize: "0.8rem", borderRadius: "8px" }}>
                      直接完成创建 (不拉取模型)
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* 步骤 3：获取到的模型选择列表 */}
          {wizardStep === 3 && (() => {
            const totalCount = fetchedModels.length;
            const hasAnyCaps = fetchedModels.some(m =>
              m.cap_reasoning || m.cap_vision || m.cap_tools || m.cap_embedding || m.cap_reranking || m.cap_long_context
            );
            const filteredCount = fetchedModels.filter(m => {
              if (wizardSearchQuery.trim()) {
                const q = wizardSearchQuery.toLowerCase();
                if (!m.name.toLowerCase().includes(q) && !(m.display_name || "").toLowerCase().includes(q)) return false;
              }
              if (hasAnyCaps && wizardFeatureTab !== "all") {
                switch (wizardFeatureTab) {
                  case "reasoning":  return !!m.cap_reasoning;
                  case "vision":     return !!m.cap_vision;
                  case "tools":      return !!m.cap_tools;
                  case "embedding":  return !!m.cap_embedding;
                  case "reranking":  return !!m.cap_reranking;
                  case "long_ctx":   return !!m.cap_long_context;
                  default:           return true;
                }
              }
              return true;
            }).length;
            const isFiltered = wizardSearchQuery.trim().length > 0 || (hasAnyCaps && wizardFeatureTab !== "all");
            const displayCount = isFiltered ? `${filteredCount}/${totalCount}` : `${totalCount}`;

            return (
              <div>
                <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h4 style={{ fontSize: "0.92rem", fontWeight: "700", margin: 0 }}>模型列表发现成功</h4>
                      <span style={{ 
                        fontSize: "0.74rem", 
                        fontWeight: 600, 
                        padding: "2px 8px", 
                        borderRadius: "6px", 
                        backgroundColor: "hsl(var(--primary) / 0.1)", 
                        color: "hsl(var(--primary))"
                      }}>
                        {displayCount}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "2px" }}>来自上游大模型端点解析的全部活跃模型</p>
                  </div>
                </div>
                {renderModelPullingInterface(
                  fetchedModels,
                  wizardSearchQuery,
                  setWizardSearchQuery,
                  isFetchingModels,
                  handleFetchModels,
                  selectedFetchedModelNames,
                  (name, isAdded) => {
                    if (isAdded) {
                      setSelectedFetchedModelNames(prev => prev.filter(n => n !== name));
                    } else {
                      setSelectedFetchedModelNames(prev => [...prev, name]);
                    }
                  },
                  () => {
                    const filtered = fetchedModels.filter(m => {
                      if (wizardSearchQuery.trim()) {
                        const q = wizardSearchQuery.toLowerCase();
                        if (!m.name.toLowerCase().includes(q) && !(m.display_name || "").toLowerCase().includes(q)) return false;
                      }
                      if (hasAnyCaps && wizardFeatureTab !== "all") {
                        switch (wizardFeatureTab) {
                          case "reasoning":  return !!m.cap_reasoning;
                          case "vision":     return !!m.cap_vision;
                          case "tools":      return !!m.cap_tools;
                          case "embedding":  return !!m.cap_embedding;
                          case "reranking":  return !!m.cap_reranking;
                          case "long_ctx":   return !!m.cap_long_context;
                          default:           return true;
                        }
                      }
                      return true;
                    });
                    setSelectedFetchedModelNames(filtered.map(m => m.name));
                  },
                  wizardFeatureTab,
                  setWizardFeatureTab
                )}
              </div>
            );
          })()}

          {/* 向导底部控制按钮 */}
          {!isFetchingModels && !fetchModelsError && (
            <div className="wizard-footer">
              {wizardStep > 1 && wizardStep !== 4 ? (
                <button className="btn-secondary" onClick={() => { setWizardStep(wizardStep - 1); setFetchModelsError(null); }}>上一步</button>
              ) : (
                <div></div>
              )}
              
              {wizardStep === 1 && (
                <div style={{ display: "flex", gap: "10px" }}>
                  <button className="btn-secondary" onClick={handleSaveProviderOnly} style={{ padding: "0 18px", height: "40px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 600 }}>
                    直接完成创建
                  </button>
                  <button className="btn-primary" onClick={handleFetchModels}>下一步 (发现模型) &nbsp; <ChevronRight size={15} /></button>
                </div>
              )}
              {wizardStep === 3 && (
                <button className="btn-primary" onClick={handleAddProviderSubmit}><Check size={16} /> 一键全部导入添加</button>
              )}
            </div>
          )}

          {/* 正在拉取模型时的底部控制 */}
          {isFetchingModels && (
            <div className="wizard-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button className="btn-secondary" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>上一步</button>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                <RotateCw size={12} className="anim-spin" /> 正在发现上游模型...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
