
import { Server, X, EyeOff, Eye } from "lucide-react";
import { CustomSelect, Provider } from "../../App";

interface ConnectionModalProps {
  showProviderConnectionModal: boolean;
  setShowProviderConnectionModal: (show: boolean) => void;
  editConnectionData: Provider | null;
  setEditConnectionData: (data: Provider | null) => void;
  showConnectionApiKey: boolean;
  setShowConnectionApiKey: (show: boolean) => void;
  handleSaveProviderConnection: () => void;
}

export function ConnectionModal({
  showProviderConnectionModal,
  setShowProviderConnectionModal,
  editConnectionData,
  setEditConnectionData,
  showConnectionApiKey,
  setShowConnectionApiKey,
  handleSaveProviderConnection
}: ConnectionModalProps) {
  if (!showProviderConnectionModal || !editConnectionData) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content-window" style={{ maxWidth: "560px", width: "90%" }}>
        <header className="modal-header-section" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Server size={16} style={{ color: "#fff" }} />
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1rem", margin: 0 }}>连接配置</h3>
          </div>
          <button
            style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}
            onClick={() => {
              setShowProviderConnectionModal(false);
              setEditConnectionData(null);
            }}
          >
            <X size={15} />
          </button>
        </header>

        <div className="modal-body-section" style={{ padding: "20px" }}>
          <div className="form-group">
            <label>供应商名称</label>
            <input 
              value={editConnectionData.name} 
              onChange={(e) => setEditConnectionData({ ...editConnectionData, name: e.target.value })} 
            />
          </div>
          <div className="form-group">
            <label>协议类型</label>
            <CustomSelect 
              value={editConnectionData.protocol} 
              onChange={(v) => setEditConnectionData({ ...editConnectionData, protocol: v })}
              options={[
                { value: "claude", label: "Claude 协议" },
                { value: "codex_responses", label: "Codex /responses 协议" },
                { value: "codex_chat", label: "Codex /chat 协议" }
              ]}
            />
          </div>
          <div className="form-group">
            <label>API 基础地址</label>
            <input 
              value={editConnectionData.api_url} 
              onChange={(e) => setEditConnectionData({ ...editConnectionData, api_url: e.target.value })} 
            />
          </div>
          <div className="form-group">
            <label>API Key</label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input 
                type={showConnectionApiKey ? "text" : "password"}
                value={editConnectionData.api_key} 
                onChange={(e) => setEditConnectionData({ ...editConnectionData, api_key: e.target.value })} 
                style={{ paddingRight: "36px", width: "100%" }}
              />
              <div 
                style={{ position: "absolute", right: "10px", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center" }}
                onClick={() => setShowConnectionApiKey(!showConnectionApiKey)}
              >
                {showConnectionApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </div>
            </div>
          </div>

          <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button className="btn-secondary" onClick={() => setShowProviderConnectionModal(false)}>取消</button>
            <button className="btn-primary" onClick={handleSaveProviderConnection}>保存配置</button>
          </div>
        </div>
      </div>
    </div>
  );
}
