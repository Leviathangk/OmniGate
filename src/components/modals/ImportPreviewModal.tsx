
import { Download, X, PackagePlus, PackageCheck, Check, RotateCw, Plus } from "lucide-react";
import { ImportPreviewItem } from "../../App";

interface ImportPreviewModalProps {
  showImportModal: boolean;
  setShowImportModal: (show: boolean) => void;
  importFileName: string;
  importPreviewList: ImportPreviewItem[];
  handleImportAllNew: () => void;
  handleImportSingleProvider: (index: number) => void;
}

export function ImportPreviewModal({
  showImportModal,
  setShowImportModal,
  importFileName,
  importPreviewList,
  handleImportAllNew,
  handleImportSingleProvider
}: ImportPreviewModalProps) {
  if (!showImportModal) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowImportModal(false); } }}>
      <div className="modal-content-window import-preview-modal">
        {/* Header */}
        <header className="modal-header-section">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Download size={18} style={{ color: "#fff" }} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "2px" }}>导入供应商预览</h3>
              <p style={{ fontSize: "0.76rem", color: "hsl(var(--text-secondary))", margin: 0 }}>
                {importFileName} &nbsp;·&nbsp;
                共 <strong>{importPreviewList.length}</strong> 个供应商，
                <strong style={{ color: "hsl(var(--primary))" }}>{importPreviewList.filter(x => !x.alreadyExists && !x.isImported).length}</strong> 个可导入，
                <strong style={{ color: "hsl(var(--text-muted))" }}>{importPreviewList.filter(x => x.alreadyExists).length}</strong> 个已存在，
                <strong style={{ color: "hsl(120,60%,50%)" }}>{importPreviewList.filter(x => x.isImported).length}</strong> 个已完成
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={() => setShowImportModal(false)}><X size={20} /></button>
        </header>

        {/* Bulk action bar */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid hsl(var(--border-color))", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "hsl(var(--bg-sidebar) / 0.4)" }}>
          <span style={{ fontSize: "0.8rem", color: "hsl(var(--text-secondary))" }}>
            可添加的排在前面，已存在的排在后面（基于 API URL + API Key 双重匹配）
          </span>
          {(() => {
            const importableCount = importPreviewList.filter(x => !x.alreadyExists && !x.isImported && !x.isImporting).length;
            return (
              <button
                className="btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "7px 14px", opacity: importableCount === 0 ? 0.4 : 1 }}
                disabled={importableCount === 0}
                onClick={handleImportAllNew}
              >
                <PackagePlus size={15} />
                一键导入所有可添加的 ({importableCount})
              </button>
            );
          })()}
        </div>

        {/* Provider list */}
        <div className="modal-body-section" style={{ padding: "0" }}>
          <table className="data-table import-preview-table">
            <thead>
              <tr>
                <th style={{ width: "32px" }}></th>
                <th>供应商名称</th>
                <th>API URL</th>
                <th>协议</th>
                <th style={{ textAlign: "center" }}>模型数</th>
                <th style={{ textAlign: "right" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {importPreviewList.map((item, idx) => {
                const done = item.isImported;
                const loading = item.isImporting;
                return (
                  <tr key={idx} className={item.alreadyExists ? "import-row-exists" : done ? "import-row-done" : "import-row-new"}>
                    {/* Status icon */}
                    <td style={{ textAlign: "center", paddingRight: "4px" }}>
                      {done ? (
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "hsl(142 60% 45%)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          <Check size={13} style={{ color: "#fff" }} />
                        </div>
                      ) : item.alreadyExists ? (
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "hsl(var(--border-color))", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          <PackageCheck size={13} style={{ color: "hsl(var(--text-muted))" }} />
                        </div>
                      ) : (
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "hsl(var(--primary) / 0.18)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          <PackagePlus size={13} style={{ color: "hsl(var(--primary))" }} />
                        </div>
                      )}
                    </td>
                    {/* Name */}
                    <td style={{ fontWeight: 600, fontSize: "0.86rem", color: item.alreadyExists ? "hsl(var(--text-muted))" : "hsl(var(--text-primary))" }}>
                      {item.name}
                    </td>
                    {/* API URL */}
                    <td>
                      <code style={{ fontSize: "0.73rem", color: item.alreadyExists ? "hsl(var(--text-muted))" : "hsl(var(--text-secondary))", wordBreak: "break-all" }}>
                        {item.api_url}
                      </code>
                    </td>
                    {/* Protocol badge */}
                    <td>
                      <span className={`status-badge ${item.alreadyExists ? "" : "secondary"}`} style={{ opacity: item.alreadyExists ? 0.5 : 1 }}>
                        {item.protocol === "claude" && "Claude"}
                        {item.protocol === "codex_responses" && "Codex /resp"}
                        {item.protocol === "codex_chat" && "Codex /chat"}
                      </span>
                    </td>
                    {/* Model count */}
                    <td style={{ textAlign: "center" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: item.alreadyExists ? "hsl(var(--text-muted))" : "hsl(var(--text-secondary))" }}>
                        {item.models.length}
                        {item.protocol === "claude" && item.models.some(m => m.mapping) && (
                          <span style={{ marginLeft: "4px", fontSize: "0.68rem", color: "hsl(var(--primary))", fontWeight: 400 }}>+映射</span>
                        )}
                      </span>
                    </td>
                    {/* Action */}
                    <td style={{ textAlign: "right" }}>
                      {done ? (
                        <span style={{ fontSize: "0.78rem", color: "hsl(142 60% 45%)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <Check size={13} /> 已导入
                        </span>
                      ) : item.alreadyExists ? (
                        <button disabled style={{ padding: "4px 12px", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid hsl(var(--border-color))", background: "transparent", color: "hsl(var(--text-muted))", cursor: "not-allowed" }}>
                          已存在
                        </button>
                      ) : (
                        <button
                          className="btn-primary"
                          style={{ padding: "4px 12px", fontSize: "0.76rem", display: "inline-flex", alignItems: "center", gap: "5px", opacity: loading ? 0.6 : 1 }}
                          disabled={loading}
                          onClick={() => handleImportSingleProvider(idx)}
                        >
                          {loading ? (
                            <><RotateCw size={12} className="anim-spin" /> 导入中...</>
                          ) : (
                            <><Plus size={12} /> 添加</>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid hsl(var(--border-color))", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-secondary" style={{ fontSize: "0.84rem" }} onClick={() => setShowImportModal(false)}>关闭</button>
        </div>
      </div>
    </div>
  );
}
