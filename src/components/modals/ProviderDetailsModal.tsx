
import { Server, X, Search, Plus, Brain, Eye, Wrench, Database, ArrowUpDown, Maximize2, Cpu, Minus } from "lucide-react";
import { Provider, Model } from "../../App";

interface ProviderDetailsModalProps {
  showProviderDetailsModal: boolean;
  setShowProviderDetailsModal: (show: boolean) => void;
  selectedProviderForDetails: Provider | null;
  setSelectedProviderForDetails: (provider: Provider | null) => void;
  models: Model[];
  modelsSearchQuery: string;
  setModelsSearchQuery: (query: string) => void;
  manualModelName: string;
  setManualModelName: (name: string) => void;
  handleManualAddModel: () => void;
  handleOpenPullModal: () => void;
  activeFeatureTab: string;
  setActiveFeatureTab: (tab: string) => void;
  handleDeleteModel: (id: string) => void;
}

export function ProviderDetailsModal({
  showProviderDetailsModal,
  setShowProviderDetailsModal,
  selectedProviderForDetails,
  setSelectedProviderForDetails,
  models,
  modelsSearchQuery,
  setModelsSearchQuery,
  manualModelName,
  setManualModelName,
  handleManualAddModel,
  handleOpenPullModal,
  activeFeatureTab,
  setActiveFeatureTab,
  handleDeleteModel
}: ProviderDetailsModalProps) {
  if (!showProviderDetailsModal || !selectedProviderForDetails) return null;

  const providerModels = models.filter(m => m.provider_id === selectedProviderForDetails.id);
  const hasAnyCapabilities = providerModels.some(m => 
    m.cap_reasoning || m.cap_vision || m.cap_tools || m.cap_embedding || m.cap_reranking || m.cap_long_context
  );
  
  const filteredDetailsModels = models.filter(m => {
    if (m.provider_id !== selectedProviderForDetails.id) return false;
    if (modelsSearchQuery.trim()) {
      const q = modelsSearchQuery.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !(m.display_name || "").toLowerCase().includes(q)) return false;
    }
    if (hasAnyCapabilities && activeFeatureTab !== "all") {
      switch (activeFeatureTab) {
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

  return (
    <div className="modal-overlay">
      <div className="modal-content-window" style={{ maxWidth: "860px", width: "92%", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        
        {/* ---- 弹窗标题栏 ---- */}
        <header className="modal-header-section" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Server size={16} style={{ color: "#fff" }} />
            </div>
            <div>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1rem", margin: 0 }}>
                {selectedProviderForDetails.name} 模型管理
              </h3>
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                {selectedProviderForDetails.api_url}
              </span>
            </div>
          </div>
          <button
            style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}
            onClick={() => {
              setShowProviderDetailsModal(false);
              setSelectedProviderForDetails(null);
            }}
          >
            <X size={15} />
          </button>
        </header>

        <div className="modal-body-section" style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", padding: "14px 20px", flex: 1 }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
            {/* 工具栏：搜索 + 手动添加 + 数量 + 拉取 */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {/* 搜索框 */}
              <div style={{ display: "flex", alignItems: "center", flex: 1, height: "34px", borderRadius: "8px", border: "1px solid hsl(var(--border-color))", backgroundColor: "hsl(var(--bg-app))", padding: "0 10px", position: "relative" }}>
                <Search size={13} style={{ color: "hsl(var(--text-secondary))", position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
                <input 
                  placeholder="搜索模型 ID 或名称" 
                  value={modelsSearchQuery}
                  onChange={(e) => setModelsSearchQuery(e.target.value)}
                  style={{ background: "transparent", border: "none", color: "hsl(var(--text-primary))", fontSize: "0.82rem", outline: "none", width: "100%", paddingLeft: "22px" }}
                />
              </div>

              {/* 手动输入 + 添加按钮 */}
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <input
                  placeholder="手动输入模型 ID"
                  value={manualModelName}
                  onChange={(e) => setManualModelName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleManualAddModel(); }}
                  style={{
                    height: "34px", width: "160px", borderRadius: "8px",
                    border: "1px solid hsl(var(--border-color))",
                    backgroundColor: "hsl(var(--bg-app))",
                    color: "hsl(var(--text-primary))",
                    fontSize: "0.8rem", outline: "none", padding: "0 10px"
                  }}
                />
                <button
                  onClick={handleManualAddModel}
                  title="手动添加模型"
                  style={{
                    height: "34px", padding: "0 12px", borderRadius: "8px",
                    border: "1px solid hsl(var(--primary) / 0.3)",
                    backgroundColor: "hsl(var(--primary) / 0.08)",
                    color: "hsl(var(--primary))",
                    fontSize: "0.8rem", fontWeight: 600,
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap"
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "hsl(var(--primary) / 0.15)"; }}
                  onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "hsl(var(--primary) / 0.08)"; }}
                >
                  <Plus size={13} />
                  <span>手动添加</span>
                </button>
              </div>

              {/* 模型数量统计 */}
              <div style={{ fontSize: "0.8rem", color: "hsl(var(--text-secondary))", fontWeight: 500, whiteSpace: "nowrap" }}>
                共 <strong style={{ color: "hsl(var(--primary))" }}>{filteredDetailsModels.length}</strong> 个
              </div>

              {/* 拉取模型按钮 */}
              <button
                onClick={handleOpenPullModal}
                style={{ 
                  height: "34px", 
                  borderRadius: "8px", 
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  padding: "0 14px",
                  display: "inline-flex", 
                  alignItems: "center", 
                  gap: "6px",
                  cursor: "pointer",
                  border: "none",
                  backgroundColor: "hsl(var(--primary))",
                  color: "#fff",
                  boxShadow: "0 3px 8px hsl(var(--primary) / 0.2)",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap"
                }}
                onMouseOver={(e) => { e.currentTarget.style.opacity = "0.88"; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                <Plus size={13} />
                <span>拉取模型</span>
              </button>
            </div>

            {/* 能力过滤 Tabs */}
            {hasAnyCapabilities && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[
                  { id: "all",       label: "全部",     icon: null },
                  { id: "reasoning", label: "推理",     icon: <Brain size={12} /> },
                  { id: "vision",    label: "视觉",     icon: <Eye size={12} /> },
                  { id: "tools",     label: "工具调用", icon: <Wrench size={12} /> },
                  { id: "embedding", label: "嵌入向量", icon: <Database size={12} /> },
                  { id: "reranking", label: "重排序",   icon: <ArrowUpDown size={12} /> },
                  { id: "long_ctx",  label: "长上下文", icon: <Maximize2 size={12} /> },
                ].map(tab => {
                  const isActive = activeFeatureTab === tab.id;
                  return (
                    <button 
                      key={tab.id} 
                      onClick={() => setActiveFeatureTab(tab.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        fontSize: "0.76rem", padding: "6px 12px", borderRadius: "8px",
                        border: isActive ? "1px solid hsl(var(--primary) / 0.4)" : "1px solid hsl(var(--border-color))",
                        backgroundColor: isActive ? "hsl(var(--primary) / 0.1)" : "hsl(var(--bg-app))",
                        color: isActive ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
                        cursor: "pointer", transition: "all 0.2s", fontWeight: isActive ? 600 : 400
                      }}
                      onMouseOver={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "hsl(var(--border-card))"; }}
                      onMouseOut={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "hsl(var(--bg-app))"; }}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 模型表格列表 */}
            <div style={{ height: "300px", overflowY: "auto", border: "1px solid hsl(var(--border-color))", borderRadius: "12px", backgroundColor: "hsl(var(--bg-card))", boxShadow: "var(--card-shadow)" }}>
              {filteredDetailsModels.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "hsl(var(--text-muted))", fontSize: "0.82rem", padding: "40px 0" }}>
                  <Database size={24} style={{ opacity: 0.3, marginBottom: "8px" }} />
                  <span>暂无已添加的模型</span>
                  <span style={{ fontSize: "0.74rem", opacity: 0.6, marginTop: "4px" }}>请点击上方“拉取模型”按钮发现并添加</span>
                </div>
              ) : (
                <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--border-color))", backgroundColor: "hsl(var(--bg-app))" }}>
                      <th style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "hsl(var(--bg-app))", textAlign: "left", padding: "10px 16px", fontSize: "0.78rem", color: "hsl(var(--text-secondary))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid hsl(var(--border-color))" }}>模型标识名称</th>
                      {hasAnyCapabilities && (
                        <th style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "hsl(var(--bg-app))", textAlign: "left", padding: "10px 16px", fontSize: "0.78rem", color: "hsl(var(--text-secondary))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid hsl(var(--border-color))" }}>能力特性</th>
                      )}
                      <th style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "hsl(var(--bg-app))", width: "80px", textAlign: "right", padding: "10px 16px", fontSize: "0.78rem", color: "hsl(var(--text-secondary))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid hsl(var(--border-color))" }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDetailsModels.map((m, idx) => {
                      const isReasoning = !!m.cap_reasoning;
                      const grad = isReasoning 
                        ? "linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--primary) / 0.22))"
                        : "linear-gradient(135deg, hsl(var(--secondary) / 0.12), hsl(var(--secondary) / 0.22))";
                      const iconColor = isReasoning ? "hsl(var(--primary))" : "hsl(var(--secondary))";
                      const techIcon = isReasoning ? <Brain size={14} /> : <Cpu size={14} />;

                      return (
                        <tr 
                          key={m.id || idx}
                          style={{ 
                            borderBottom: "1px solid hsl(var(--border-color))", 
                            backgroundColor: "transparent",
                            transition: "background-color 0.2s"
                          }}
                        >
                          {/* 左侧：专业微徽标 + 模型名 */}
                          <td style={{ padding: "10px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                              <div style={{ 
                                width: "32px", height: "32px", borderRadius: "8px", 
                                background: grad, flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: iconColor
                              }}>
                                {techIcon}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.86rem", fontWeight: 600, color: "hsl(var(--text-primary))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "340px", letterSpacing: "-0.01em" }}>
                                  {m.name}
                                </div>
                                {m.context_length && m.context_length !== "-" && (
                                  <div style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))", marginTop: "3px" }}>{m.context_length} ctx</div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 能力特性 */}
                          {hasAnyCapabilities && (
                            <td style={{ padding: "10px 16px" }}>
                              <div style={{ display: "flex", gap: "4px" }}>
                                {m.cap_reasoning && (
                                  <span title="推理 / Chain-of-Thought" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", borderRadius: "6px", backgroundColor: "rgba(168, 85, 247, 0.12)", color: "#a855f7" }}>
                                    <Brain size={12} />
                                  </span>
                                )}
                                {m.cap_vision && (
                                  <span title="视觉 / Multimodal" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", borderRadius: "6px", backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#3b82f6" }}>
                                    <Eye size={12} />
                                  </span>
                                )}
                                {m.cap_tools && (
                                  <span title="工具调用 / Function Calling" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", borderRadius: "6px", backgroundColor: "rgba(245, 158, 11, 0.12)", color: "#f59e0b" }}>
                                    <Wrench size={12} />
                                  </span>
                                )}
                                {m.cap_embedding && (
                                  <span title="嵌入向量模型" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", borderRadius: "6px", backgroundColor: "rgba(16, 185, 129, 0.12)", color: "#10b981" }}>
                                    <Database size={12} />
                                  </span>
                                )}
                                {m.cap_reranking && (
                                  <span title="文本重排序模型" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", borderRadius: "6px", backgroundColor: "rgba(20, 184, 166, 0.12)", color: "#14b8a6" }}>
                                    <ArrowUpDown size={12} />
                                  </span>
                                )}
                                {m.cap_long_context && (
                                  <span title="长上下文 ≥ 128K" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", borderRadius: "6px", backgroundColor: "rgba(236, 72, 153, 0.12)", color: "#ec4899" }}>
                                    <Maximize2 size={12} />
                                  </span>
                                )}
                              </div>
                            </td>
                          )}

                          {/* 右侧：删除按钮 */}
                          <td style={{ padding: "10px 16px", textAlign: "right" }}>
                            <button
                              onClick={() => handleDeleteModel(m.id)}
                              title="删除此模型"
                              style={{ 
                                width: "32px", height: "32px", borderRadius: "8px",
                                border: "1px solid hsl(var(--danger) / 0.15)",
                                backgroundColor: "hsl(var(--danger) / 0.06)",
                                color: "hsl(var(--danger))",
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", transition: "all 0.2s"
                              }}
                              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "hsl(var(--danger) / 0.12)"; e.currentTarget.style.transform = "scale(1.05)"; }}
                              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "hsl(var(--danger) / 0.06)"; e.currentTarget.style.transform = "scale(1)"; }}
                            >
                              <Minus size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
