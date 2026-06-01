import React from "react";

interface GlobalPromptsTabProps {
  globalPromptSubTab: string;
  setGlobalPromptSubTab: (tab: string) => void;
  renderCliMask: (clientId: string) => React.ReactNode;
  handleSaveGlobalPrompt: (clientId: string) => void;
  globalPrompts: Record<string, string>;
  setGlobalPrompts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function GlobalPromptsTab({
  globalPromptSubTab,
  setGlobalPromptSubTab,
  renderCliMask,
  handleSaveGlobalPrompt,
  globalPrompts,
  setGlobalPrompts
}: GlobalPromptsTabProps) {
  return (
    <div className="tab-pane animate-fade-in" style={{ paddingBottom: "100px" }}>
      <div className="tab-selector" style={{ marginBottom: "24px", display: "flex", alignItems: "center" }}>
        <div style={{ display: "inline-flex", gap: "8px" }}>
          <button className={`tab-select-btn ${globalPromptSubTab === "claude" ? "active" : ""}`} onClick={() => setGlobalPromptSubTab("claude")}>Claude Code</button>
          <button className={`tab-select-btn ${globalPromptSubTab === "codex" ? "active" : ""}`} onClick={() => setGlobalPromptSubTab("codex")}>Codex CLI</button>
          <button className={`tab-select-btn ${globalPromptSubTab === "opencode" ? "active" : ""}`} onClick={() => setGlobalPromptSubTab("opencode")}>OpenCode CLI</button>
        </div>
      </div>

      <div>
        {["claude", "codex", "opencode"].filter(id => id === globalPromptSubTab).map(clientId => (
          <div className="panel-card" key={clientId} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
            {renderCliMask(clientId)}
            <div className="card-header-row" style={{ borderBottom: "1px solid hsl(var(--border-color))", paddingBottom: "16px", marginBottom: "16px" }}>
              <div>
                <h3 style={{ textTransform: "capitalize", fontSize: "1.2rem" }}>
                  {clientId === "claude" ? "Claude Code" : clientId === "codex" ? "Codex CLI" : "OpenCode CLI"} 全局系统提示词
                </h3>
                <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  原生文件: <code style={{ backgroundColor: "hsl(var(--bg-app))", padding: "1px 5px", borderRadius: "3px" }}>
                    {clientId === "opencode" ? "~/.config/opencode/AGENTS.md" : `~/.${clientId}/${clientId === "claude" ? "CLAUDE.md" : "AGENTS.md"}`}
                  </code>
                </p>
              </div>
              <div>
                <button className="btn-primary" style={{ padding: "6px 14px", fontSize: "0.85rem", height: "auto" }} onClick={() => handleSaveGlobalPrompt(clientId)}>保存设置</button>
              </div>
            </div>
            
            <textarea 
              value={globalPrompts[clientId] || ""} 
              onChange={(e) => setGlobalPrompts(prev => ({...prev, [clientId]: e.target.value}))}
              style={{ height: "calc(100vh - 340px)", minHeight: "400px", width: "100%", backgroundColor: "hsl(var(--bg-app))", border: "1px solid hsl(var(--border-color))", borderRadius: "8px", padding: "12px", color: "var(--text-primary)", fontSize: "0.9rem", fontFamily: "monospace", resize: "none", outline: "none", boxSizing: "border-box" }}
              placeholder={`在此输入 ${clientId} 的全局系统提示词...`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
