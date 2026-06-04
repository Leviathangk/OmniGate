import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save, AlertTriangle, X } from "lucide-react";

interface ConfigFilesTabProps {
  cliStatus: Record<string, boolean>;
  showToast: (msg: string, type: "success" | "error" | "warning" | "info") => void;
  setTabDirty: (dirty: boolean) => void;
  registerSaveHandler?: (saveFn: () => Promise<boolean>) => void;
}

export const ConfigFilesTab: React.FC<ConfigFilesTabProps> = ({ cliStatus, showToast, setTabDirty, registerSaveHandler }) => {
  const [activeSubTab, setActiveSubTab] = useState<string>("claude");
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  
  const isDirty = content !== originalContent;

  useEffect(() => {
    setTabDirty(isDirty);
    return () => setTabDirty(false);
  }, [isDirty, setTabDirty]);

  useEffect(() => {
    loadConfig();
  }, [activeSubTab]);

  const loadConfig = async () => {
    if (!cliStatus[activeSubTab]) {
      setContent("");
      return;
    }
    
    setIsLoading(true);
    try {
      const res = await invoke<string>("read_client_raw_config", { clientId: activeSubTab });
      setContent(res);
      setOriginalContent(res);
    } catch (e: any) {
      setContent("");
      setOriginalContent("");
      showToast(`读取配置文件失败: ${e}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      await invoke("write_client_raw_config", { clientId: activeSubTab, content });
      setOriginalContent(content);
      showToast("配置文件已成功保存", "success");
      return true;
    } catch (e: any) {
      showToast(`保存失败: ${e}`, "error");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [activeSubTab, content, showToast]);

  useEffect(() => {
    if (registerSaveHandler) {
      registerSaveHandler(handleSave);
    }
  }, [registerSaveHandler, handleSave]);

  const getTargetFileStr = (clientId: string) => {
    if (clientId === "claude") return "~/.claude/settings.json";
    if (clientId === "codex") return "~/.codex/config.toml";
    return "~/.config/opencode/opencode.json";
  };

  const handleTabSwitch = (newTab: string) => {
    if (isDirty) {
      setPendingTab(newTab);
    } else {
      setActiveSubTab(newTab);
    }
  };

  const confirmSwitch = () => {
    if (pendingTab) {
      setActiveSubTab(pendingTab);
      setPendingTab(null);
    }
  };

  const saveAndSwitch = async () => {
    if (pendingTab) {
      const success = await handleSave();
      if (success) {
        setActiveSubTab(pendingTab);
        setPendingTab(null);
      }
    }
  };

  const cancelSwitch = () => {
    setPendingTab(null);
  };

  const renderCliMask = (clientId: string) => {
    if (cliStatus[clientId]) return null;
    const dirName = clientId === "opencode" ? "~/.config/opencode" : `~/.${clientId}`;
    return (
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: "12px", border: "1px solid hsl(var(--border-color))" }}>
        <AlertTriangle size={32} style={{ color: "var(--warning)", marginBottom: "16px" }} />
        <h3 style={{ fontSize: "1.1rem", color: "white", marginBottom: "8px" }}>未检测到该 CLI 工具环境</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          目录 <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px" }}>{dirName}</code> 不存在，暂不提供配置。请先安装对应的 CLI 工具。
        </p>
      </div>
    );
  };

  return (
    <div className="tab-pane active" style={{ display: "flex", flexDirection: "column", height: "100%", gap: "16px" }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className={`tab-select-btn ${activeSubTab === "claude" ? "active" : ""}`} onClick={() => handleTabSwitch("claude")}>Claude 配置</button>
            <button className={`tab-select-btn ${activeSubTab === "codex" ? "active" : ""}`} onClick={() => handleTabSwitch("codex")}>Codex 配置</button>
            <button className={`tab-select-btn ${activeSubTab === "opencode" ? "active" : ""}`} onClick={() => handleTabSwitch("opencode")}>OpenCode 配置</button>
          </div>
          
          <div style={{ display: "flex", gap: "10px", visibility: isDirty ? "visible" : "hidden" }}>
            <button 
              className="btn-secondary" 
              onClick={() => setContent(originalContent)}
              disabled={isSaving}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <X size={16} />
              取消
            </button>
            <button 
              className="btn-primary" 
              onClick={handleSave}
              disabled={isSaving || !cliStatus[activeSubTab]}
              style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: "hsl(var(--success))", borderColor: "hsl(var(--success))" }}
            >
              <Save size={16} />
              {isSaving ? "正在保存..." : "保存修改"}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>目标文件路径：</span>
          <code style={{ fontSize: "0.8rem", color: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary)/0.1)", padding: "2px 8px", borderRadius: "4px" }}>
            {getTargetFileStr(activeSubTab)}
          </code>
        </div>

        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
          {renderCliMask(activeSubTab)}
          
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isLoading || !cliStatus[activeSubTab]}
            placeholder={isLoading ? "正在加载配置文件..." : "配置文件内容为空"}
            style={{
              flex: 1,
              width: "100%",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid hsl(var(--border-color))",
              backgroundColor: "hsl(var(--bg-app))",
              color: "hsl(var(--text-primary))",
              fontFamily: "'Fira Code', 'Courier New', Courier, monospace",
              fontSize: "0.85rem",
              lineHeight: "1.5",
              resize: "none",
              outline: "none",
              boxSizing: "border-box"
            }}
          />
        </div>
      </div>

      {pendingTab && (
        <div className="modal-overlay">
          <div className="modal-content-window" style={{ maxWidth: "500px" }} onClick={e => e.stopPropagation()}>
            <header className="modal-header-section" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, hsl(var(--warning)), #fbbf24)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <AlertTriangle size={16} style={{ color: "#fff" }} />
                </div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1rem", margin: 0, color: "hsl(var(--text-primary))" }}>
                    有未保存的修改
                  </h3>
                </div>
              </div>
            </header>
            
            <div className="modal-body-section" style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.6 }}>
              当前配置已被修改但尚未保存。切换客户端将会丢失这些修改。确定要放弃修改吗？
            </div>
            
            <footer style={{ display: "flex", justifyContent: "flex-end", gap: "12px", padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <button className="btn-secondary" onClick={cancelSwitch}>继续编辑</button>
              <button className="btn-secondary" onClick={confirmSwitch} style={{ color: "hsl(var(--danger))", borderColor: "hsl(var(--danger)/0.3)", background: "hsl(var(--danger)/0.1)" }}>放弃更改</button>
              <button className="btn-primary" onClick={saveAndSwitch}>保存修改</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};
