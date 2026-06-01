
import { Server, X } from "lucide-react";
import { Provider, Model } from "../../App";

interface MappingModalProps {
  showMappingModal: boolean;
  setShowMappingModal: (show: boolean) => void;
  mappingProvider: Provider | null;
  mappingModels: Model[];
  handleMappingChange: (id: string, val: string) => void;
  handleMappingBlur: (id: string, val: string) => void;
  handleDefaultChange: (id: string, checked: boolean) => void;
}

export function MappingModal({
  showMappingModal,
  setShowMappingModal,
  mappingProvider,
  mappingModels,
  handleMappingChange,
  handleMappingBlur,
  handleDefaultChange
}: MappingModalProps) {
  if (!showMappingModal || !mappingProvider) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content-window" style={{ maxWidth: "600px", width: "90%" }}>
        <header className="modal-header-section" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Server size={16} style={{ color: "#fff" }} />
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1rem", margin: 0 }}>模型映射 <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "normal" }}>(仅限 Claude 转发使用)</span></h3>
          </div>
          <button
            style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}
            onClick={() => setShowMappingModal(false)}
          >
            <X size={15} />
          </button>
        </header>

        <div className="modal-body-section" style={{ padding: "20px", maxHeight: "60vh", overflowY: "auto" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px", lineHeight: "1.5" }}>
            💡 仅在 <strong>Claude 客户端转发</strong> 时生效。<br/>
            当客户端请求的模型等于映射别名时，将自动替换为左侧的实际模型。多个别名请用英文逗号 <code style={{ fontSize: "0.75rem", backgroundColor: "hsl(var(--bg-app))", padding: "2px 4px", borderRadius: "4px"}}>,</code> 分隔。<br/>
            如果您勾选了<strong>「设为默认」</strong>，则无论客户端请求什么模型，都将被强制无条件路由至该默认模型（此时映射配置将失效并被禁用）。
          </p>
          
          {mappingModels.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              该供应商尚未启用任何模型，请先在“模型信息”中选择并启用模型。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {mappingModels.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ flex: 1, fontSize: "0.85rem", fontWeight: "600", color: "var(--text-primary)" }}>
                    {m.name}
                  </div>
                  <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                    <input
                      type="text"
                      style={{ padding: "8px 12px", fontSize: "0.8rem", opacity: m.is_mapped_default ? 0.5 : 1 }}
                      placeholder="例如: claude-opus-4-6"
                      value={m.mapping || ""}
                      onChange={(e) => handleMappingChange(m.id, e.target.value)}
                      onBlur={(e) => handleMappingBlur(m.id, e.target.value)}
                      disabled={m.is_mapped_default}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "80px", justifyContent: "flex-end" }}>
                    <input 
                      type="checkbox" 
                      id={`default-${m.id}`}
                      checked={m.is_mapped_default || false}
                      onChange={(e) => handleDefaultChange(m.id, e.target.checked)}
                      style={{ cursor: "pointer", accentColor: "hsl(var(--primary))" }}
                    />
                    <label htmlFor={`default-${m.id}`} style={{ fontSize: "0.8rem", color: "var(--text-secondary)", cursor: "pointer", margin: 0, fontWeight: "normal" }}>设为默认</label>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
            <button className="btn-primary" style={{ padding: "8px 24px", fontSize: "0.85rem" }} onClick={() => setShowMappingModal(false)}>
              完成配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
