
import { X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Provider, Model, renderModelPullingInterface } from "../../App";

interface PullModalProps {
  showPullModal: boolean;
  setShowPullModal: (show: boolean) => void;
  selectedProviderForDetails: Provider | null;
  fetchedModelsForPull: Model[];
  setFetchedModelsForPull: (models: Model[]) => void;
  pullSearchQuery: string;
  setPullSearchQuery: (query: string) => void;
  isSyncingModels: boolean;
  setIsSyncingModels: (syncing: boolean) => void;
  pullFeatureTab: string;
  setPullFeatureTab: (tab: string) => void;
  models: Model[];
  setModels: (models: Model[]) => void;
  handleDeleteModel: (id: string) => Promise<void>;
  loadData: () => Promise<void>;
}

export function PullModal({
  showPullModal,
  setShowPullModal,
  selectedProviderForDetails,
  fetchedModelsForPull,
  setFetchedModelsForPull,
  pullSearchQuery,
  setPullSearchQuery,
  isSyncingModels,
  setIsSyncingModels,
  pullFeatureTab,
  setPullFeatureTab,
  models,
  setModels,
  handleDeleteModel,
  loadData
}: PullModalProps) {
  if (!showPullModal || !selectedProviderForDetails) return null;

  const totalCount = fetchedModelsForPull.length;
  const filteredCount = fetchedModelsForPull.filter(m => {
    if (pullSearchQuery.trim()) {
      const q = pullSearchQuery.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !(m.display_name || "").toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  }).length;
  const isFiltered = pullSearchQuery.trim().length > 0;
  const displayCount = isFiltered ? `${filteredCount}/${totalCount}` : `${totalCount}`;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content-window" style={{ maxWidth: "640px", width: "90%", display: "flex", flexDirection: "column", padding: "24px" }}>
        <header className="modal-header-section" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "16px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", margin: 0 }}>
              {selectedProviderForDetails.name}模型
            </h3>
            <span style={{ 
              fontSize: "0.78rem", 
              fontWeight: 600, 
              padding: "2px 8px", 
              borderRadius: "6px", 
              backgroundColor: "hsl(var(--primary) / 0.1)", 
              color: "hsl(var(--primary))"
            }}>
              {displayCount}
            </span>
          </div>
          <button
            style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}
            onClick={() => setShowPullModal(false)}
          >
            <X size={15} />
          </button>
        </header>
      
      {renderModelPullingInterface(
        fetchedModelsForPull,
        pullSearchQuery,
        setPullSearchQuery,
        isSyncingModels,
        async () => {
          setIsSyncingModels(true);
          try {
            const result = await invoke<Model[]>("discover_models", {
              apiUrl: selectedProviderForDetails.api_url,
              apiKey: selectedProviderForDetails.api_key,
              protocol: selectedProviderForDetails.protocol,
              providerId: selectedProviderForDetails.id,
            });
            setFetchedModelsForPull(result);
          } catch (err) {
            alert("拉取模型失败: " + err);
          } finally {
            setIsSyncingModels(false);
          }
        },
        models.filter(m => m.provider_id === selectedProviderForDetails.id).map(m => m.name),
        async (name, isAdded) => {
          try {
            if (isAdded) {
              const targetModel = models.find(m => m.provider_id === selectedProviderForDetails.id && m.name === name);
              if (targetModel) {
                await handleDeleteModel(targetModel.id);
              }
            } else {
              await invoke("add_models_to_provider", {
                providerId: selectedProviderForDetails.id,
                modelNames: [name],
              });
              const modList = await invoke<Model[]>("get_models", { providerId: selectedProviderForDetails.id });
              setModels(modList);
              await loadData();
            }
          } catch (err) {
            console.error("操作模型失败:", err);
          }
        },
        async () => {
          try {
            const existingNames = models.filter(m => m.provider_id === selectedProviderForDetails.id).map(m => m.name);
            const hasAnyCapabilities = fetchedModelsForPull.some(m =>
              m.cap_reasoning || m.cap_vision || m.cap_tools || m.cap_embedding || m.cap_reranking || m.cap_long_context
            );
            const filtered = fetchedModelsForPull.filter(m => {
              if (pullSearchQuery.trim()) {
                const q = pullSearchQuery.toLowerCase();
                if (!m.name.toLowerCase().includes(q) && !(m.display_name || "").toLowerCase().includes(q)) return false;
              }
              if (hasAnyCapabilities && pullFeatureTab !== "all") {
                switch (pullFeatureTab) {
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
            const newNames = filtered.map(m => m.name).filter(name => !existingNames.includes(name));
            if (newNames.length > 0) {
              await invoke("add_models_to_provider", {
                providerId: selectedProviderForDetails.id,
                modelNames: newNames,
              });
              const modList = await invoke<Model[]>("get_models", { providerId: selectedProviderForDetails.id });
              setModels(modList);
              await loadData();
            }
          } catch (err) {
            console.error("一键全部添加失败:", err);
          }
        },
        pullFeatureTab,
        setPullFeatureTab
      )}
    </div>
  </div>
  );
}
