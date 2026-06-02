import { Download, Upload, Plus, Trash2 } from "lucide-react";
import React from "react";

import { Provider } from "../../App";

interface ProvidersTabProps {
  importFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleImportFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportProviders: () => void;
  isExporting: boolean;
  setShowAddProviderModal: (show: boolean) => void;
  setWizardStep: (step: number) => void;
  providers: Provider[];
  handleToggleProvider: (provider: any) => void;
  handleOpenProviderConnection: (provider: any) => void;
  handleOpenProviderDetails: (provider: any) => void;
  handleOpenModelMapping: (provider: any) => void;
  handleDeleteProvider: (id: string) => void;
  handleResetProviderPenalty: (id: string) => void;
}

export function ProvidersTab({
  importFileInputRef,
  handleImportFileChange,
  handleExportProviders,
  isExporting,
  setShowAddProviderModal,
  setWizardStep,
  providers,
  handleToggleProvider,
  handleOpenProviderConnection,
  handleOpenProviderDetails,
  handleOpenModelMapping,
  handleDeleteProvider,
  handleResetProviderPenalty
}: ProvidersTabProps) {
  return (
    <div className="panel-card">
      <div className="card-header-row">
        <h3>已接管的 AI 供应商列表</h3>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem" }}
            onClick={() => importFileInputRef.current?.click()}>
            <Download size={14} /> 导入
          </button>
          <input ref={importFileInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFileChange} />
          <button className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem" }}
            onClick={handleExportProviders} disabled={isExporting}>
            <Upload size={14} /> {isExporting ? "导出中..." : "导出"}
          </button>
          <button className="btn-primary" onClick={() => { setShowAddProviderModal(true); setWizardStep(1); }}><Plus size={16} /> 添加新供应商</button>
        </div>
      </div>

      <div className="responsive-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>供应商名称</th>
              <th>API 基础 URL</th>
              <th>协议类型</th>
              <th>计费模式</th>
              <th>启用状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)", fontSize: "0.82rem" }}>暂无供应商 — 点击右上角 + 按钮添加</td></tr>
            ) : providers.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: "600" }}>{p.name}</td>
                <td><code style={{ fontSize: "0.76rem" }}>{p.api_url}</code></td>
                <td>
                  <span className="status-badge secondary">
                    {p.protocol === "claude" && "Claude 协议"}
                    {p.protocol === "codex_responses" && "Codex /responses"}
                    {p.protocol === "codex_chat" && "Codex /chat"}
                  </span>
                </td>
                <td>
                  <span className="status-badge secondary">
                    {p.billing_type === "subscription"
                      ? `订阅制 (${p.reset_time || "00:00"})`
                      : `周期制 (${p.reset_time || "1"}h)`}
                  </span>
                </td>
                <td>
                  <div className="switch-container" onClick={() => handleToggleProvider(p)}>
                    <div className={`switch-track ${p.is_active ? "active" : ""}`}>
                      <div className="switch-thumb"></div>
                    </div>
                  </div>
                </td>
                <td>
                  <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "0.72rem", marginRight: "8px" }} onClick={() => handleOpenProviderConnection(p)}>配置</button>
                  <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "0.72rem", marginRight: "8px" }} onClick={() => handleOpenProviderDetails(p)}>模型</button>
                  {p.protocol === "claude" && (
                    <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "0.72rem", marginRight: "8px" }} onClick={() => handleOpenModelMapping(p)}>映射</button>
                  )}
                  <button className="btn-secondary" title="重置供应商的失败惩罚记录，立即恢复路由优先级" style={{ padding: "4px 8px", fontSize: "0.72rem", marginRight: "8px", color: "hsl(var(--success))", borderColor: "hsl(var(--success) / 0.3)" }} onClick={() => handleResetProviderPenalty(p.id)}>重置</button>
                  <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "0.72rem", color: "hsl(var(--danger))", borderColor: "hsl(var(--danger) / 0.2)" }} onClick={() => handleDeleteProvider(p.id)}><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
