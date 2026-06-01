import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  LayoutDashboard,
  Server,
  Cpu,
  Sliders,
  Brain,
  Boxes,
  Settings,
  Sun,
  Moon,
  Bell,
  Search,
  Plus,
  Check,
  Database,
  Info,
  Terminal,
  Activity,
  Eye,

  Wrench,
  ArrowUpDown,
  Maximize2,
  Minus,
  ListPlus,
  RotateCw,
  AlertTriangle,
  FileText,
} from "lucide-react";
import "./App.css";
// recharts removed
import { McpDisplay } from "./components/mcp";
import { OverviewTab } from "./components/tabs/OverviewTab";
import { ProvidersTab } from "./components/tabs/ProvidersTab";
import { ClientConfigTab } from "./components/tabs/ClientConfigTab";
import { GlobalPromptsTab } from "./components/tabs/GlobalPromptsTab";

import { SettingsTab } from "./components/tabs/SettingsTab";
import { ConnectionModal } from "./components/modals/ConnectionModal";
import { MappingModal } from "./components/modals/MappingModal";
import { ProviderDetailsModal } from "./components/modals/ProviderDetailsModal";
import { AddProviderModal } from "./components/modals/AddProviderModal";
import { PullModal } from "./components/modals/PullModal";
import { ImportPreviewModal } from "./components/modals/ImportPreviewModal";

// ============================================================================
// TypeScript 接口定义
// ============================================================================
interface TrafficPoint { time: string; count: number; avg_latency: number; error_count: number; }
interface RecentActivity { id: string; provider_name: string; model_name: string; status_code: number; latency_ms: number; error_message?: string; created_at: number; protocol?: string; }
interface ModelUsage { name: string; count: number; }
interface HeatmapData { date: string; count: number; }
export interface Provider {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  protocol: string;
  is_active: boolean;
  weight: number;
  priority: number;
}

export interface Model {
  id: string;
  provider_id: string;
  name: string;
  display_name: string;
  context_length: string;
  price_input: string;
  price_output: string;
  is_active: boolean;
  // 能力标签（由 Rust 后端规则引擎推断）
  cap_reasoning?: boolean;
  cap_vision?: boolean;
  cap_tools?: boolean;
  cap_embedding?: boolean;
  cap_reranking?: boolean;
  cap_long_context?: boolean;
  mapping?: string;
  is_mapped_default?: boolean;
}

// 导入预览条目（包含「是否已存在」状态）
export interface ImportPreviewItem {
  name: string;
  api_url: string;
  api_key: string;
  protocol: string;
  is_active: boolean;
  models: Array<{
    name: string;
    display_name: string;
    is_active: boolean;
    cap_reasoning: boolean;
    cap_vision: boolean;
    cap_tools: boolean;
    cap_embedding: boolean;
    cap_reranking: boolean;
    cap_long_context: boolean;
    mapping?: string;
    is_mapped_default?: boolean;
  }>;
  // 运行时判断字段
  alreadyExists: boolean;
  isImporting: boolean;
  isImported: boolean;
}

interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  is_active: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  is_active: boolean;
}

interface UsageOverview {
  total_providers: number;
  active_providers: number;
  total_models: number;
  active_models: number;
  total_mcp: number;
  active_mcp: number;
  today_requests: number;
  today_requests_growth: string;
  today_tokens: string;
  today_tokens_growth: string;
}



interface RecentActivity {
  name: string;
  subtitle: string;
  time_ago: string;
  icon_type: string;
}

export interface ClientConfig {
  client_id: string;
  is_enabled: boolean;
  strategy: string;
  retry_count: number;
  timeout_seconds: number;
  manual_provider_id?: string;
  direct_provider_id?: string;
  operation_mode: string;
  providers: Provider[];
}


export const getUrlPreview = (url: string, protocol: string) => {
  if (!url.trim()) return { discover: "-", forward: "-" };
  const trimmed = url.trim().replace(/\/+$/, ""); // 去除末尾斜杠
  
  // 判断末尾是否带有 /v数字 (如 /v1, /v4 等)
  const hasVersion = /\/v\d+$/.test(trimmed);
  const base = hasVersion ? trimmed : `${trimmed}/v1`;

  let discoverUrl: string;
  let forwardUrl: string;

  if (protocol === "claude") {
    discoverUrl = `${base}/models`;
    forwardUrl  = `${base}/messages`;
  } else if (protocol === "codex_responses") {
    discoverUrl = `${base}/models`;
    forwardUrl  = `${base}/responses`;
  } else {
    // codex_chat
    discoverUrl = `${base}/models`;
    forwardUrl  = `${base}/chat/completions`;
  }

  return { discover: discoverUrl, forward: forwardUrl };
};

interface SelectOption {
  value: string | number;
  label: string;
}

export interface CustomSelectProps {
  value: string | number;
  options: SelectOption[];
  onChange: (value: any) => void;
  style?: React.CSSProperties;
  width?: string | number;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ value, options, onChange, style, width = "100%" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!(e.target as HTMLElement).closest('.custom-select-portal-menu')) {
          setIsOpen(false);
        }
      }
    };
    const handleScroll = () => {
      if (isOpen) setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", handleScroll);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  const toggleDropdown = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const upward = spaceBelow < 160;
      
      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        top: upward ? "auto" : rect.bottom + 4,
        bottom: upward ? (window.innerHeight - rect.top + 4) : "auto",
        zIndex: 100000,
        backgroundColor: "hsl(var(--bg-card))",
        border: "1px solid hsl(var(--border-color))",
        borderRadius: "8px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
        maxHeight: "180px",
        overflowY: "auto",
        padding: "4px"
      });
    }
    setIsOpen(!isOpen);
  };

  const handleSelect = (val: string | number) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: "relative", 
        width: width, 
        userSelect: "none",
        ...style 
      }}
    >
      {/* Trigger Button */}
      <div 
        onClick={toggleDropdown}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderRadius: "8px",
          border: "1px solid hsl(var(--border-color))",
          backgroundColor: "hsl(var(--bg-app))",
          color: "hsl(var(--text-primary))",
          fontSize: "0.85rem",
          cursor: "pointer",
          transition: "all 0.2s",
          minHeight: "38px",
          boxSizing: "border-box"
        }}
        onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "hsl(var(--border-card))"; }}
        onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "hsl(var(--bg-app))"; }}
      >
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {selectedOption ? selectedOption.label : ""}
        </span>
        <svg 
          width="10" 
          height="6" 
          viewBox="0 0 10 6" 
          fill="none" 
          style={{ 
            marginLeft: "8px", 
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", 
            transition: "transform 0.2s",
            opacity: 0.7,
            flexShrink: 0
          }}
        >
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Dropdown Menu via Portal */}
      {isOpen && createPortal(
        <div 
          className="custom-select-portal-menu"
          style={menuStyle}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            return (
              <div 
                key={i}
                onClick={() => handleSelect(opt.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  color: isSelected ? "hsl(var(--primary))" : "hsl(var(--text-primary))",
                  backgroundColor: isSelected ? "hsl(var(--primary) / 0.1)" : "transparent",
                  fontWeight: isSelected ? 600 : 400,
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
                onMouseOver={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = "hsl(var(--border-card))";
                    e.currentTarget.style.color = "hsl(var(--text-primary))";
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "hsl(var(--text-primary))";
                  }
                }}
              >
                {opt.label}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

export const renderModelPullingInterface = (
  modelsList: Model[],
  searchQ: string,
  setSearchQ: (q: string) => void,
  isSyncing: boolean,
  onRefresh: () => Promise<void> | void,
  selectedNames: string[],
  onToggle: (name: string, isAdded: boolean) => Promise<void> | void,
  onAddAll: () => void,
  activeTab?: string,
  setActiveTab?: (tab: string) => void
) => {
  const hasAnyCapabilities = modelsList.some(m =>
    m.cap_reasoning || m.cap_vision || m.cap_tools || m.cap_embedding || m.cap_reranking || m.cap_long_context
  );

  const filtered = modelsList.filter(m => {
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !(m.display_name || "").toLowerCase().includes(q)) {
        return false;
      }
    }
    if (hasAnyCapabilities && activeTab && activeTab !== "all") {
      switch (activeTab) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* 搜索框 + 动作按钮栏 */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, height: "40px", borderRadius: "10px", border: "1px solid hsl(var(--border-color))", backgroundColor: "hsl(var(--bg-app))", padding: "0 14px", position: "relative" }}>
          <Search size={14} style={{ color: "hsl(var(--text-secondary))", position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
          <input 
            placeholder="搜索模型 ID 或名称" 
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            style={{ background: "transparent", border: "none", color: "hsl(var(--text-primary))", fontSize: "0.85rem", outline: "none", width: "100%", paddingLeft: "24px" }}
          />
        </div>
        
        {/* 一键全添加按钮 */}
        <button
          title="一键全部添加"
          onClick={onAddAll}
          disabled={filtered.length === 0}
          style={{ width: "40px", height: "40px", borderRadius: "10px", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "1px solid hsl(var(--border-color))", backgroundColor: "hsl(var(--bg-app))", color: "hsl(var(--text-secondary))", transition: "all 0.2s" }}
          onMouseOver={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.backgroundColor = "hsl(var(--border-card))"; e.currentTarget.style.transform = "scale(1.05)"; } }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "hsl(var(--bg-app))"; e.currentTarget.style.transform = "scale(1)"; }}
        >
          <ListPlus size={16} />
        </button>

        {/* 刷新按钮 */}
        <button
          title="刷新/拉取最新模型"
          onClick={onRefresh}
          disabled={isSyncing}
          style={{ width: "40px", height: "40px", borderRadius: "10px", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "1px solid hsl(var(--border-color))", backgroundColor: "hsl(var(--bg-app))", color: "hsl(var(--text-secondary))", transition: "all 0.2s" }}
          onMouseOver={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.backgroundColor = "hsl(var(--border-card))"; e.currentTarget.style.transform = "scale(1.05)"; } }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "hsl(var(--bg-app))"; e.currentTarget.style.transform = "scale(1)"; }}
        >
          <RotateCw size={15} className={isSyncing ? "anim-spin" : ""} />
        </button>
      </div>

      {/* 能力过滤 Tabs */}
      {hasAnyCapabilities && activeTab && setActiveTab && (
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
            const isActive = activeTab === tab.id;
            return (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)}
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

      {/* 固定高度的 table 区域 */}
      <div style={{ height: "300px", overflowY: "auto", border: "1px solid hsl(var(--border-color))", borderRadius: "12px", backgroundColor: "hsl(var(--bg-card))", boxShadow: "var(--card-shadow)" }}>
        {isSyncing ? (
          <div style={{ padding: "80px 0", textAlign: "center" }}>
            <RotateCw size={24} className="anim-spin" style={{ color: "hsl(var(--primary))", marginBottom: "12px", display: "inline-block" }} />
            <div style={{ fontSize: "0.82rem", color: "hsl(var(--text-secondary))" }}>正在拉取上游模型矩阵...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "hsl(var(--text-muted))", fontSize: "0.82rem", padding: "40px 0" }}>
            <Database size={24} style={{ opacity: 0.3, marginBottom: "8px" }} />
            <span>暂无拉取到可用模型</span>
            <span style={{ fontSize: "0.74rem", opacity: 0.6, marginTop: "4px" }}>请确认 API 地址/Key 并点击右侧刷新按钮拉取</span>
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
              {filtered.map((m, idx) => {
                const isAdded = selectedNames.includes(m.name);
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
                      backgroundColor: isAdded ? "hsl(var(--success-glow))" : "transparent",
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

                    {/* 右侧：添加 / 取消按钮 */}
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      {isAdded ? (
                        <button
                          onClick={() => onToggle(m.name, isAdded)}
                          title="取消选择"
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
                      ) : (
                        <button
                          onClick={() => onToggle(m.name, isAdded)}
                          title="选择添加此模型"
                          style={{ 
                            width: "32px", height: "32px", borderRadius: "8px",
                            border: "1px solid hsl(var(--primary) / 0.15)",
                            backgroundColor: "hsl(var(--primary) / 0.06)",
                            color: "hsl(var(--primary))",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", transition: "all 0.2s"
                          }}
                          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "hsl(var(--primary) / 0.12)"; e.currentTarget.style.transform = "scale(1.05)"; }}
                          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "hsl(var(--primary) / 0.06)"; e.currentTarget.style.transform = "scale(1)"; }}
                        >
                          <Plus size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};


// CustomTrafficTooltip removed

function App() {
  // ============================================================================
  // 状态定义
  // ============================================================================
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [statsPeriod, setStatsPeriod] = useState<number>(7);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);

  const [cliStatus, setCliStatus] = useState<Record<string, boolean>>({
    claude: false,
    codex: false,
    opencode: false,
  });
  const [globalPrompts, setGlobalPrompts] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkAllClis = async () => {
      try {
        const c = await invoke<boolean>("check_cli_installed", { clientId: "claude" });
        const x = await invoke<boolean>("check_cli_installed", { clientId: "codex" });
        const o = await invoke<boolean>("check_cli_installed", { clientId: "opencode" });
        setCliStatus({ claude: c, codex: x, opencode: o });
      } catch (e) {
        console.error("Failed to check CLIs:", e);
      }
    };
    checkAllClis();
  }, []);

  useEffect(() => {
    if (activeTab === "global_prompts") {
      ["claude", "codex", "opencode"].forEach(async (id) => {
        try {
           const content = await invoke<string>("read_external_prompt", { clientId: id });
           setGlobalPrompts(prev => ({...prev, [id]: content}));
        } catch(e) {
           console.error("Failed to read external prompt", id, e);
        }
      });
    }
  }, [activeTab]);

  const handleSaveGlobalPrompt = async (clientId: string) => {
    try {
      await invoke("write_external_prompt", { clientId, content: globalPrompts[clientId] || "" });
      showToast(`${clientId} 全局提示词已保存到原生文件`, "success");
      setTimeout(() => showToast("", "success"), 3000);
    } catch(e: any) {
      showToast(`保存失败: ${e}`, "error");
      setTimeout(() => showToast("", "success"), 3000);
    }
  };
  
  // 核心数据状态
  
  const [trafficTrend, setTrafficTrend] = useState<TrafficPoint[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);

  const [overviewData, setOverviewData] = useState<UsageOverview>({
    total_providers: 0, active_providers: 0,
    total_models: 0, active_models: 0,
    total_mcp: 0, active_mcp: 0,
    today_requests: 0, today_requests_growth: "+0%",
    today_tokens: "0", today_tokens_growth: "+0%"
  });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);


  // Codex 拦截代理状态
  const [hijackBaseUrl, setHijackBaseUrl] = useState("http://127.0.0.1:3456");
  const [hijackApiKey, setHijackApiKey] = useState(() => {
    const saved = localStorage.getItem("hijackApiKey");
    if (saved) return saved;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'sk-omnigate-';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    localStorage.setItem("hijackApiKey", result);
    return result;
  });
  const [hijackProviderName, setHijackProviderName] = useState("custom");
  const [hasFetchedHijackInfo, setHasFetchedHijackInfo] = useState(false);

  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "warning" | "info">("success");

  const showToast = (msg: string, type: "success" | "error" | "warning" | "info" = "success") => {
    setToastType(type);
    setToastMessage(msg);
  };

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    if (activeTab === "overview" || activeTab === "dashboard") {
      const unlisten = listen("dashboard-updated", (event: any) => {
        const data = event.payload;
        setOverviewData(data.overview);
        setTrafficTrend(data.traffic);
        setRecentActivities(data.recent);
        setModelUsage(data.model_usage);
        setHeatmapData(data.heatmap);
      });
      return () => {
        unlisten.then(f => f());
      };
    }
  }, [activeTab]);

  // UI交互与图表/客户端/设置状态
  // UI交互与图表/客户端/设置状态
  const [clientConfigs, setClientConfigs] = useState<ClientConfig[]>([
    { client_id: "claude",         is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
    { client_id: "codex",          is_enabled: false, strategy: "priority", retry_count: 3, timeout_seconds: 45,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
    { client_id: "opencode",       is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
    { client_id: "opencode-claude", is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30, operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
    { client_id: "opencode-resp",   is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30, operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
    { client_id: "opencode-chat",   is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30, operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
  ]);

  const [clientSubTab, setClientSubTab] = useState<string>("claude");
  const [globalPromptSubTab, setGlobalPromptSubTab] = useState<string>("claude");
  const [settingsSubTab, setSettingsSubTab] = useState<string>("proxy");
  const [showAddProviderModal, setShowAddProviderModal] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  
  // 客户端内添加供应商的行内编辑状态
  const [addingProviderForClient, setAddingProviderForClient] = useState<string | null>(null);
  const [addingProviderProtocol, setAddingProviderProtocol] = useState<string>("");
  const [addingProviderId, setAddingProviderId] = useState<string>("");
  
  // 添加供应商向导状态
  const [newProvName, setNewProvName] = useState<string>("");
  const [newProvUrl, setNewProvUrl] = useState<string>("");
  const [newProvKey, setNewProvKey] = useState<string>("");
  const [newProvProtocol, setNewProvProtocol] = useState<string>("claude");
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [fetchedModels, setFetchedModels] = useState<Model[]>([]);
  // 向导中已选中（要添加）的模型名称列表
  const [selectedFetchedModelNames, setSelectedFetchedModelNames] = useState<string[]>([]);
  
  // 新建 MCP 状态
  const [newMcpName, setNewMcpName] = useState<string>("");
  const [newMcpCmd, setNewMcpCmd] = useState<string>("");
  const [newMcpArgs, setNewMcpArgs] = useState<string>("");
  

  // 供应商详情与模型管理弹窗状态
  const [selectedProviderForDetails, setSelectedProviderForDetails] = useState<Provider | null>(null);
  const [showProviderDetailsModal, setShowProviderDetailsModal] = useState<boolean>(false);
  const [showProviderConnectionModal, setShowProviderConnectionModal] = useState<boolean>(false);
  const [editConnectionData, setEditConnectionData] = useState<Provider | null>(null);
  const [showConnectionApiKey, setShowConnectionApiKey] = useState<boolean>(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingProvider, setMappingProvider] = useState<Provider | null>(null);
  const [mappingModels, setMappingModels] = useState<Model[]>([]);
  const [isSyncingModels, setIsSyncingModels] = useState<boolean>(false);
  const [modelsSearchQuery, setModelsSearchQuery] = useState<string>("");
  const [manualModelName, setManualModelName] = useState<string>("");
  const [activeFeatureTab, setActiveFeatureTab] = useState<string>("all");

  // 独立的模型拉取弹窗状态
  const [showPullModal, setShowPullModal] = useState<boolean>(false);
  const [fetchedModelsForPull, setFetchedModelsForPull] = useState<Model[]>([]);
  const [pullSearchQuery, setPullSearchQuery] = useState<string>("");
  const [pullFeatureTab, setPullFeatureTab] = useState<string>("all");

  // 新增的向导模型选择搜索与标签过滤状态
  const [wizardSearchQuery, setWizardSearchQuery] = useState<string>("");
  const [wizardFeatureTab, setWizardFeatureTab] = useState<string>("all");

  // ---- 导入/导出 状态 ----
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importPreviewList, setImportPreviewList] = useState<ImportPreviewItem[]>([]);
  const [importFileName, setImportFileName] = useState<string>("");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);


  // ============================================================================
  // 数据获取与同步
  // ============================================================================
  useEffect(() => {
    // 监听暗黑模式切换
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // 当用户切到设置页时，读取本地配置
  useEffect(() => {
    if (activeTab === "settings" && !hasFetchedHijackInfo) {
      invoke<string | null>("get_codex_provider_name")
        .then(name => {
          if (name) {
            setHijackProviderName(name);
          }
          setHasFetchedHijackInfo(true);
        })
        .catch(e => console.error(e));
    }
  }, [activeTab, hasFetchedHijackInfo, hijackApiKey]);

  const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'sk-omnigate-';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setHijackApiKey(result);
    localStorage.setItem("hijackApiKey", result);
  };

  // 用 ref 记录是否已完成「首次从 DB 加载并设置状态」这两步，
  // 避免 useEffect auto-save 在数据落定之前就用旧的初始值覆写 DB。
  const clientConfigsReadyRef = useRef(false);

  // 加载核心数据（从真实 SQLite 后端）
  const loadData = async () => {
    try {
      const [overview, provList, mcpList, loadedClientConfigs, traffic, recent, dist, heatmap] = await Promise.all([
        invoke<UsageOverview>("get_usage_overview"),
        invoke<Provider[]>("get_providers"),
        invoke<McpServer[]>("get_mcp_servers"),

        invoke<ClientConfig[]>("get_client_configs"),
        invoke<TrafficPoint[]>("get_today_traffic_trend"),
        invoke<RecentActivity[]>("get_recent_activities", { limit: 10 }),
        invoke<ModelUsage[]>("get_model_usage_distribution"),
        invoke<HeatmapData[]>("get_heatmap_data"),
      ]);
      setTrafficTrend(traffic);
      setRecentActivities(recent);
      setModelUsage(dist);
      setHeatmapData(heatmap);
      setOverviewData(overview);
      setProviders(provList);
      setMcpServers(mcpList);

      let targetConfigs = loadedClientConfigs;
      if (loadedClientConfigs && loadedClientConfigs.length > 0) {
        // Merge: DB 数据优先，DB 里没有的 client_id 用默认值补齐
        // 这样新增的 opencode-claude / opencode-resp / opencode-chat 可以自动初始化
        const defaultClientConfigs: ClientConfig[] = [
          { client_id: "claude",          is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
          { client_id: "codex",           is_enabled: false, strategy: "priority", retry_count: 3, timeout_seconds: 45,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
          { client_id: "opencode",        is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
          { client_id: "opencode-claude", is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
          { client_id: "opencode-resp",   is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
          { client_id: "opencode-chat",   is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
        ];
        const mergedConfigs = defaultClientConfigs.map(def => {
          const fromDb = loadedClientConfigs.find((c: ClientConfig) => c.client_id === def.client_id);
          return fromDb || def;
        });
        // 将 DB 里有但 defaults 里没有的条目也保留（向前兼容）
        const extraFromDb = loadedClientConfigs.filter((c: ClientConfig) =>
          !defaultClientConfigs.some(def => def.client_id === c.client_id)
        );
        const finalConfigs = [...mergedConfigs, ...extraFromDb];

        // 将新补齐的 client_id 写回 DB（幂等，多次无害）
        const missingIds = defaultClientConfigs.filter(def =>
          !loadedClientConfigs.some((c: ClientConfig) => c.client_id === def.client_id)
        );
        if (missingIds.length > 0) {
          invoke("save_client_configs", { configs: finalConfigs }).catch(console.error);
        }

        clientConfigsReadyRef.current = true;
        setClientConfigs(finalConfigs);
        targetConfigs = finalConfigs;

      } else {
        // DB 为空：直接用默认配置初始化，不经过 auto-save
        clientConfigsReadyRef.current = false;
        await invoke("save_client_configs", {
          configs: [
            { client_id: "claude",          is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
            { client_id: "codex",           is_enabled: false, strategy: "priority", retry_count: 3, timeout_seconds: 45,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
            { client_id: "opencode",        is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
            { client_id: "opencode-claude", is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
            { client_id: "opencode-resp",   is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
            { client_id: "opencode-chat",   is_enabled: false, strategy: "priority", retry_count: 2, timeout_seconds: 30,  operation_mode: "proxy", direct_provider_id: undefined, providers: [] },
          ]
        });
        // 完成后允许 auto-save
        clientConfigsReadyRef.current = true;
        targetConfigs = clientConfigs;
      }
      
      // 保证应用启动时配置文件的一致性
      if (targetConfigs) {
        const codexCfg = targetConfigs.find((c: ClientConfig) => c.client_id === "codex");
        if (codexCfg && codexCfg.is_enabled) {
          invoke("hijack_codex_config", {
            providerName: hijackProviderName || "custom",
            baseUrl: hijackBaseUrl || "http://127.0.0.1:3456",
            proxyApiKey: hijackApiKey || "sk-omnigate-fallback"
          }).catch((e) => {
            console.error("启动接管失败:", e);
            setClientConfigs(prev => prev.map(c => c.client_id === "codex" ? { ...c, is_enabled: false } : c));
            alert(String(e));
          });
        } else {
          invoke("restore_codex_config").catch(console.error);
        }

        const opencodeCfg = targetConfigs.find((c: ClientConfig) => c.client_id === "opencode");
        if (opencodeCfg && opencodeCfg.is_enabled) {
          invoke("hijack_opencode_config", {
            proxyApiKey: hijackApiKey || "sk-omnigate-fallback"
          }).catch((e) => {
            console.error("OpenCode 启动接管失败:", e);
            setClientConfigs(prev => prev.map(c => c.client_id === "opencode" ? { ...c, is_enabled: false } : c));
            alert(String(e));
          });
        } else {
          invoke("restore_opencode_config").catch(console.error);
        }
      }
    } catch (err) {
      console.error("加载数据失败:", err);
      // 即使加载失败，也要开放 auto-save 阈值，否则用户操作永远不会被保存
      clientConfigsReadyRef.current = true;
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 自动保存客户端配置：只有在数据已从 DB 加载并渲染后才执行
  useEffect(() => {
    if (!clientConfigsReadyRef.current) return;
    invoke("save_client_configs", { configs: clientConfigs })
      .then(() => {
        // 若 OpenCode 接管已开启，保存后自动重新写入 opencode.json（更新模型字典）
        const opencodeCfg = clientConfigs.find(c => c.client_id === "opencode");
        if (opencodeCfg && opencodeCfg.is_enabled) {
          invoke("hijack_opencode_config", { proxyApiKey: hijackApiKey }).catch(console.error);
        }
      })
      .catch(e => console.error("自动保存客户端配置失败:", e));
  }, [clientConfigs]);

  // ============================================================================
  // 事件处理逻辑
  // ============================================================================
  // 打开供应商详情（加载该供应商下的模型）
  const handleOpenProviderDetails = async (provider: Provider) => {
    setSelectedProviderForDetails(provider);
    setShowProviderDetailsModal(true);
    setModelsSearchQuery("");
    setActiveFeatureTab("all");
    setFetchedModelsForPull([]);
    setPullSearchQuery("");
    setPullFeatureTab("all");
    try {
      const modList = await invoke<Model[]>("get_models", { providerId: provider.id });
      setModels(modList);
    } catch (err) {
      console.error("加载模型失败:", err);
    }
  };

  const handleOpenModelMapping = async (provider: Provider) => {
    setMappingProvider(provider);
    setShowMappingModal(true);
    try {
      const modList = await invoke<Model[]>("get_models", { providerId: provider.id });
      // 只保留已启用的模型进行映射
      setMappingModels(modList.filter(m => m.is_active));
    } catch (err) {
      console.error("加载映射模型失败:", err);
    }
  };

  const handleMappingChange = (modelId: string, value: string) => {
    setMappingModels(prev => prev.map(m => m.id === modelId ? { ...m, mapping: value } : m));
  };

  const handleMappingBlur = async (modelId: string, mapping: string) => {
    try {
      await invoke("update_model_mapping", { id: modelId, mapping });
    } catch (e) {
      alert("保存映射失败: " + e);
    }
  };

  const handleDefaultChange = async (modelId: string, isDefault: boolean) => {
    if (!mappingProvider) return;
    try {
      await invoke("update_model_mapped_default", { providerId: mappingProvider.id, modelId, isDefault });
      setMappingModels(prev => prev.map(m => {
        if (m.id === modelId) return { ...m, is_mapped_default: isDefault };
        if (isDefault) return { ...m, is_mapped_default: false };
        return m;
      }));
    } catch (err: any) {
      alert("设置默认失败：" + err);
    }
  };

  const handleOpenProviderConnection = (provider: Provider) => {
    setEditConnectionData({ ...provider });
    setShowConnectionApiKey(false); // 重置眼睛开关状态
    setShowProviderConnectionModal(true);
  };

  const handleSaveProviderConnection = async () => {
    if (!editConnectionData) return;
    try {
      await invoke("update_provider_info", {
        id: editConnectionData.id,
        name: editConnectionData.name,
        apiUrl: editConnectionData.api_url,
        apiKey: editConnectionData.api_key,
        protocol: editConnectionData.protocol,
      });
      // 更新本地状态
      setProviders(prev => prev.map(p => p.id === editConnectionData.id ? editConnectionData : p));
      setShowProviderConnectionModal(false);
      setEditConnectionData(null);
      
      // 同步到所有的 config 客户端（刷新可能的变更）
      const codexCfg = clientConfigs.find(c => c.client_id === "codex");
      if (codexCfg?.is_enabled) {
        await invoke("hijack_codex_config", {
          providerName: hijackProviderName || "custom",
          baseUrl: hijackBaseUrl || "http://127.0.0.1:3456",
          proxyApiKey: hijackApiKey || "sk-omnigate-fallback"
        }).catch(console.error);
      }
      const openCodeCfg = clientConfigs.find(c => c.client_id === "opencode");
      if (openCodeCfg?.is_enabled) {
        await invoke("hijack_opencode_config", {
          proxyApiKey: hijackApiKey || "sk-omnigate-fallback"
        }).catch(console.error);
      }
      
    } catch (err) {
      alert("保存连接配置失败: " + err);
    }
  };

  // 打开拉取弹窗并自动拉取（如果缓存为空）
  const handleOpenPullModal = async () => {
    setShowPullModal(true);
    if (selectedProviderForDetails && fetchedModelsForPull.length === 0) {
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
        console.error("自动拉取上游模型失败:", err);
      } finally {
        setIsSyncingModels(false);
      }
    }
  };

  // 从数据库删除已添加的模型
  const handleDeleteModel = async (modelId: string) => {
    try {
      await invoke("delete_model", { id: modelId });
      if (selectedProviderForDetails) {
        const modList = await invoke<Model[]>("get_models", { providerId: selectedProviderForDetails.id });
        setModels(modList);
      }
      await loadData();
    } catch (err) {
      console.error("删除模型失败:", err);
    }
  };

  // 切换供应商激活状态
  const handleToggleProvider = async (p: Provider) => {
    try {
      await invoke("toggle_provider", { id: p.id, isActive: !p.is_active });
      setProviders(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x));
    } catch (err) {
      console.error("切换供应商失败:", err);
    }
  };

  // 删除供应商
  const handleDeleteProvider = async (id: string) => {
    if (!confirm("确认删除此供应商？关联的模型也将被删除。")) return;
    try {
      await invoke("delete_provider", { id });
      setProviders(prev => prev.filter(p => p.id !== id));
      await loadData(); // 刷新统计数据
    } catch (err) {
      console.error("删除供应商失败:", err);
    }
  };

  // ============================================================================
  // 供应商导出
  // ============================================================================
  const handleExportProviders = async () => {
    if (providers.length === 0) { showToast("暂无供应商可导出", "warning"); return; }
    setIsExporting(true);
    try {
      // 逐一拉取每个供应商下的模型数据
      const exportData = await Promise.all(
        providers.map(async (p) => {
          const providerModels = await invoke<Model[]>("get_models", { providerId: p.id });
          return {
            name: p.name,
            api_url: p.api_url,
            api_key: p.api_key,
            protocol: p.protocol,
            is_active: p.is_active,
            models: providerModels.map(m => ({
              name: m.name,
              display_name: m.display_name,
              is_active: m.is_active,
              cap_reasoning: m.cap_reasoning ?? false,
              cap_vision: m.cap_vision ?? false,
              cap_tools: m.cap_tools ?? false,
              cap_embedding: m.cap_embedding ?? false,
              cap_reranking: m.cap_reranking ?? false,
              cap_long_context: m.cap_long_context ?? false,
              ...(m.mapping ? { mapping: m.mapping } : {}),
              ...(m.is_mapped_default ? { is_mapped_default: m.is_mapped_default } : {}),
            })),
          };
        })
      );

      const payload = {
        version: "1.0",
        exported_at: new Date().toISOString(),
        providers: exportData,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `omnigate-providers-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`成功导出 ${providers.length} 个供应商配置`, "success");
    } catch (err) {
      showToast("导出失败：" + err, "error");
    } finally {
      setIsExporting(false);
    }
  };

  // ============================================================================
  // 供应商导入 — 文件解析
  // ============================================================================
  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (!json.providers || !Array.isArray(json.providers)) {
          showToast("文件格式不正确，缺少 providers 字段", "error");
          return;
        }
        // 与本地已有供应商对比（api_url + api_key 双字段匹配）
        const preview: ImportPreviewItem[] = json.providers.map((p: any) => {
          const alreadyExists = providers.some(
            (local) => local.api_url === p.api_url && local.api_key === p.api_key
          );
          return {
            name: p.name ?? "未命名",
            api_url: p.api_url ?? "",
            api_key: p.api_key ?? "",
            protocol: p.protocol ?? "codex_chat",
            is_active: p.is_active ?? true,
            models: Array.isArray(p.models) ? p.models : [],
            alreadyExists,
            isImporting: false,
            isImported: false,
          };
        });
        // 排序：可添加的排前面，已存在的排后面
        preview.sort((a, b) => Number(a.alreadyExists) - Number(b.alreadyExists));
        setImportPreviewList(preview);
        setShowImportModal(true);
      } catch {
        showToast("JSON 解析失败，请检查文件格式", "error");
      }
    };
    reader.readAsText(file);
    // 重置 input，确保同名文件可以再次选择
    e.target.value = "";
  };

  // 导入单个供应商
  const handleImportSingleProvider = async (index: number) => {
    const item = importPreviewList[index];
    if (!item || item.alreadyExists || item.isImporting || item.isImported) return;

    setImportPreviewList(prev => prev.map((x, i) => i === index ? { ...x, isImporting: true } : x));
    try {
      // 1. 创建供应商
      const newId = await invoke<string>("add_provider", {
        name: item.name,
        apiUrl: item.api_url,
        apiKey: item.api_key,
        protocol: item.protocol,
      });

      // 2. 批量写入所有模型（后端用 add_models_to_provider 接收 model_names 列表）
      if (item.models.length > 0) {
        await invoke<number>("add_models_to_provider", {
          providerId: newId,
          modelNames: item.models.map(m => m.name),
        });

        // 3. 对 Claude 协议的模型写入映射信息
        if (item.protocol === "claude") {
          // 重新拉取刚写入的模型以获得它们的 id
          const savedModels = await invoke<Model[]>("get_models", { providerId: newId });
          for (const savedModel of savedModels) {
            const srcModel = item.models.find(m => m.name === savedModel.name);
            if (!srcModel) continue;
            if (srcModel.mapping) {
              await invoke("update_model_mapping", { id: savedModel.id, mapping: srcModel.mapping }).catch(console.error);
            }
            if (srcModel.is_mapped_default) {
              await invoke("update_model_mapped_default", { providerId: newId, modelId: savedModel.id, isDefault: true }).catch(console.error);
            }
          }
        }
      }

      setImportPreviewList(prev => prev.map((x, i) => i === index ? { ...x, isImporting: false, isImported: true } : x));
      await loadData();
      showToast(`供应商「${item.name}」导入成功`, "success");
    } catch (err) {
      setImportPreviewList(prev => prev.map((x, i) => i === index ? { ...x, isImporting: false } : x));
      showToast(`导入「${item.name}」失败：${err}`, "error");
    }
  };

  // 一键导入所有可添加的供应商
  const handleImportAllNew = async () => {
    const newItems = importPreviewList
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.alreadyExists && !item.isImported);
    if (newItems.length === 0) return;
    for (const { index } of newItems) {
      await handleImportSingleProvider(index);
    }
  };


  const handleToggleClient = async (clientId: string) => {
    const config = clientConfigs.find(c => c.client_id === clientId);
    if (!config) return;
    const newEnabledState = !config.is_enabled;

    if (clientId === "opencode") {
      // 联动控制：操作 opencode 总开关时，连带把三个协议子开关一起切掉
      setClientConfigs(prev => prev.map(c => 
        (c.client_id === "opencode" || c.client_id.startsWith("opencode-"))
          ? { ...c, is_enabled: newEnabledState } 
          : c
      ));
    } else {
      setClientConfigs(prev => prev.map(c => c.client_id === clientId ? { ...c, is_enabled: newEnabledState } : c));
    }

    if (clientId === "codex") {
      if (!newEnabledState) {
        // Toggled OFF -> restore original config
        try {
          await invoke("restore_codex_config");
          console.log("已还原 Codex 配置文件");
        } catch (e) {
          console.error("还原 Codex 配置失败", e);
        }
      } else {
        // Toggled ON -> hijack config
        try {
          if (!hijackApiKey) {
            await new Promise(r => setTimeout(r, 100));
          }
          await invoke("hijack_codex_config", {
            providerName: hijackProviderName || "custom",
            baseUrl: hijackBaseUrl || "http://127.0.0.1:3456",
            proxyApiKey: hijackApiKey || "sk-omnigate-fallback"
          });
          console.log("已接管 Codex 配置文件");
        } catch (e) {
          console.error("接管 Codex 配置失败", e);
          alert(String(e));
          setClientConfigs(prev => prev.map(c => c.client_id === clientId ? { ...c, is_enabled: false } : c));
        }
      }
    }

    if (clientId === "opencode") {
      if (!newEnabledState) {
        // Toggled OFF -> restore opencode.json
        try {
          await invoke("restore_opencode_config");
          console.log("已还原 OpenCode 配置文件");
        } catch (e) {
          console.error("还原 OpenCode 配置失败", e);
        }
      } else {
        // Toggled ON -> hijack opencode.json
        try {
          if (!hijackApiKey) {
            await new Promise(r => setTimeout(r, 100));
          }
          await invoke("hijack_opencode_config", {
            proxyApiKey: hijackApiKey || "sk-omnigate-fallback"
          });
          console.log("已接管 OpenCode 配置文件");
        } catch (e) {
          console.error("接管 OpenCode 配置失败", e);
          alert(String(e));
          setClientConfigs(prev => prev.map(c => c.client_id === clientId ? { ...c, is_enabled: false } : c));
        }
      }
    }

    if (clientId === "claude") {
      if (!newEnabledState) {
        try {
          await invoke("restore_claude_config");
          console.log("已还原 Claude 配置文件");
        } catch (e) {
          console.error("还原 Claude 配置失败", e);
        }
      } else {
        try {
          if (!hijackApiKey) {
            await new Promise(r => setTimeout(r, 100));
          }
          await invoke("hijack_claude_config", {
            proxyApiKey: hijackApiKey || "sk-omnigate-fallback"
          });
          console.log("已接管 Claude 配置文件");
        } catch (e) {
          console.error("接管 Claude 配置失败", e);
          alert(String(e));
          setClientConfigs(prev => prev.map(c => c.client_id === clientId ? { ...c, is_enabled: false } : c));
        }
      }
    }
  };


  const reapplyProxyConfig = async (clientId: string) => {
    // Only re-apply if the client is currently enabled
    const config = clientConfigs.find(c => c.client_id === clientId);
    if (!config || !config.is_enabled) return;
    
    if (clientId === "codex") {
      try {
        await invoke("hijack_codex_config", {
          providerName: hijackProviderName || "custom",
          baseUrl: hijackBaseUrl || "http://127.0.0.1:3456",
          proxyApiKey: hijackApiKey || "sk-omnigate-fallback"
        });
      } catch (e) {}
    } else if (clientId === "claude") {
      try {
        await invoke("hijack_claude_config", {
          proxyApiKey: hijackApiKey || "sk-omnigate-fallback"
        });
      } catch (e) {}
    } else if (clientId === "opencode") {
      try {
        await invoke("hijack_opencode_config", {
          proxyApiKey: hijackApiKey || "sk-omnigate-fallback"
        });
      } catch (e) {}
    }
  };

  const handleStrategyChange = (clientId: string, strategy: string) => {
    setClientConfigs(prev => prev.map(c => c.client_id === clientId ? { ...c, strategy } : c));
  };

  const handleWeightChange = (clientId: string, providerId: string, weight: number) => {
    setClientConfigs(prev => prev.map(c => {
      if (c.client_id === clientId) {
        return {
          ...c,
          providers: c.providers.map(p => p.id === providerId ? { ...p, weight } : p)
        };
      }
      return c;
    }));
  };

  const handleToggleClientProvider = (clientId: string, providerId: string) => {
    setClientConfigs(prev => prev.map(c => {
      if (c.client_id === clientId) {
        return {
          ...c,
          providers: c.providers.map(p => p.id === providerId ? { ...p, is_active: !p.is_active } : p)
        };
      }
      return c;
    }));
  };

  const handleMoveProvider = (clientId: string, index: number, direction: number) => {
    setClientConfigs(prev => prev.map(c => {
      if (c.client_id === clientId) {
        const newProviders = [...c.providers];
        const newIndex = index + direction;
        if (newIndex >= 0 && newIndex < newProviders.length) {
          // Swap elements
          const temp = newProviders[index];
          newProviders[index] = newProviders[newIndex];
          newProviders[newIndex] = temp;
        }
        return { ...c, providers: newProviders };
      }
      return c;
    }));
  };

  const handleToggleMcp = (id: string) => {
    setMcpServers(prev => prev.map(s => s.id === id ? { ...s, is_active: !s.is_active } : s));
  };

  // 详情：手动添加单个模型
  const handleManualAddModel = async () => {
    if (!selectedProviderForDetails) return;
    const name = manualModelName.trim();
    if (!name) { alert("请输入模型 ID"); return; }
    try {
      await invoke("add_models_to_provider", {
        providerId: selectedProviderForDetails.id,
        modelNames: [name],
      });
      const modList = await invoke<Model[]>("get_models", { providerId: selectedProviderForDetails.id });
      setModels(modList);
      setManualModelName("");
      await loadData();
    } catch (err) {
      alert("添加模型失败: " + err);
    }
  };

  // 向导：从上游拉取模型列表（调用真实 /v1/models API）
  const handleFetchModels = async () => {
    if (!newProvUrl.trim() || !newProvKey.trim()) {
      alert("请填写 API URL 和 API Key");
      return;
    }
    setFetchModelsError(null);
    setIsFetchingModels(true);
    setWizardStep(2);
    try {
      const result = await invoke<Model[]>("discover_models", {
        apiUrl: newProvUrl,
        apiKey: newProvKey,
        protocol: newProvProtocol,
        providerId: "__wizard_preview__",
      });
      setFetchedModels(result);
      // 默认不选中任何，由用户点 + 添加
      setSelectedFetchedModelNames([]);
      setIsFetchingModels(false);
      setWizardStep(3);
    } catch (err) {
      console.error("Discover models failed:", err);
      setFetchModelsError(String(err));
      setIsFetchingModels(false);
    }
  };

  // 向导：跳过模型拉取，直接创建供应商（提前结束）
  const handleSaveProviderOnly = async () => {
    if (!newProvName.trim()) {
      alert("请输入供应商名称");
      return;
    }
    try {
      await invoke<string>("add_provider", {
        name: newProvName,
        apiUrl: newProvUrl,
        apiKey: newProvKey,
        protocol: newProvProtocol,
      });
      await loadData();
      setShowAddProviderModal(false);
      setWizardStep(1);
      setFetchModelsError(null);
      setNewProvName(""); setNewProvUrl(""); setNewProvKey(""); setNewProvProtocol("claude");
      setFetchedModels([]); setSelectedFetchedModelNames([]);
    } catch (err) {
      alert("保存供应商失败: " + err);
    }
  };

  // 向导：提交供应商 + 保存已选模型
  const handleAddProviderSubmit = async () => {
    if (!newProvName.trim()) { alert("请输入供应商名称"); return; }
    if (selectedFetchedModelNames.length === 0) { alert("请至少选择一个模型"); return; }
    try {
      // 1. 先创建供应商，拿到新 ID
      const newId = await invoke<string>("add_provider", {
        name: newProvName,
        apiUrl: newProvUrl,
        apiKey: newProvKey,
        protocol: newProvProtocol,
      });
      // 2. 批量保存已选模型
      await invoke<number>("add_models_to_provider", {
        providerId: newId,
        modelNames: selectedFetchedModelNames,
      });
      // 3. 刷新数据
      await loadData();
      // 4. 重置向导
      setShowAddProviderModal(false);
      setWizardStep(1);
      setNewProvName(""); setNewProvUrl(""); setNewProvKey(""); setNewProvProtocol("claude");
      setFetchedModels([]); setSelectedFetchedModelNames([]);
    } catch (err) {
      alert("保存失败: " + err);
    }
  };



  // 添加 MCP 服务
  const handleAddMcp = () => {
    if (!newMcpName || !newMcpCmd) return;
    const newMcp: McpServer = {
      id: "mcp_" + Math.random().toString(36).substring(7),
      name: newMcpName,
      command: newMcpCmd,
      args: newMcpArgs ? newMcpArgs.split(",").map(a => a.trim()) : [],
      env: {},
      is_active: true
    };
    setMcpServers(prev => [...prev, newMcp]);
    setOverviewData(prev => ({
      ...prev,
      total_mcp: prev.total_mcp + 1,
      active_mcp: prev.active_mcp + 1
    }));
    setNewMcpName("");
    setNewMcpCmd("");
    setNewMcpArgs("");
    alert("MCP 服务添加成功！");
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
    <div className={`app-container ${darkMode ? "dark" : ""}`}>
      {/* 顶部居中 Toast 弹窗 */}
      {toastMessage && (
        <div style={{
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: toastType === "error" ? "hsl(var(--danger))" : toastType === "warning" ? "hsl(var(--warning))" : toastType === "success" ? "hsl(var(--primary))" : "hsl(var(--bg-card))",
          color: "white",
          padding: "12px 24px",
          borderRadius: "8px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          zIndex: 9999,
          fontWeight: "600",
          fontSize: "0.9rem",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          {toastType === "error" ? <AlertTriangle size={18} /> : toastType === "success" ? <Check size={18} /> : <Info size={18} />}
          {toastMessage}
        </div>
      )}

      {/* ============================================================================
          SIDEBAR NAVIGATION (Vector Lucide Icons)
         ============================================================================ */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon" style={{ background: "transparent", boxShadow: "none" }}>
            <img src="/logo.png" alt="OmniGate Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div className="logo-info">
            <h1>OmniGate</h1>
            <span>AI账号轮换管理器 v0.1.5</span>
          </div>
        </div>

        <div className="menu-section">
          <div className="menu-title">监控</div>
          <ul className="menu-list">
            <li className={`menu-item ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
              <div className="menu-icon"><LayoutDashboard size={17} /></div>
              <span>核心概览</span>
            </li>
          </ul>
        </div>

        <div className="menu-section">
          <div className="menu-title">代理管理</div>
          <ul className="menu-list">
            <li className={`menu-item ${activeTab === "providers" ? "active" : ""}`} onClick={() => setActiveTab("providers")}>
              <div className="menu-icon"><Server size={17} /></div>
              <span>供应商管理</span>
            </li>
            <li className={`menu-item ${activeTab === "client_config" ? "active" : ""}`} onClick={() => setActiveTab("client_config")}>
              <div className="menu-icon"><Sliders size={17} /></div>
              <span>客户端配置</span>
            </li>
          </ul>
        </div>

        <div className="menu-section">
          <div className="menu-title">功能管理</div>
          <ul className="menu-list">
            <li className={`menu-item ${activeTab === "global_prompts" ? "active" : ""}`} onClick={() => setActiveTab("global_prompts")}>
              <div className="menu-icon"><FileText size={17} /></div>
              <span>全局提示词</span>
            </li>

            <li className={`menu-item ${activeTab === "mcp" ? "active" : ""}`} onClick={() => setActiveTab("mcp")}>
              <div className="menu-icon"><Boxes size={17} /></div>
              <span>MCP 服务管理</span>
            </li>
          </ul>
        </div>


        <div className="menu-section">
          <div className="menu-title">配置</div>
          <ul className="menu-list">
            <li className={`menu-item ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")}>
              <div className="menu-icon"><Settings size={17} /></div>
              <span>系统设置</span>
            </li>
          </ul>
        </div>

        <div className="menu-section" style={{ marginTop: "auto" }}>
          <div className="menu-title">客户端状态</div>
          <ul className="menu-list">
            <li className="menu-item" style={{ cursor: "default" }}>
              <div className="menu-icon" style={{ color: "hsl(var(--primary))" }}><Activity size={16} /></div>
              <span>Claude</span>
              <div className={`client-status-dot ${clientConfigs.find(c => c.client_id === "claude")?.is_enabled ? "active" : "inactive"}`}></div>
            </li>
            <li className="menu-item" style={{ cursor: "default" }}>
              <div className="menu-icon" style={{ color: "hsl(var(--secondary))" }}><Terminal size={16} /></div>
              <span>Codex</span>
              <div className={`client-status-dot ${clientConfigs.find(c => c.client_id === "codex")?.is_enabled ? "active" : "inactive"}`}></div>
            </li>
            <li className="menu-item" style={{ cursor: "default" }}>
              <div className="menu-icon" style={{ color: "hsl(var(--warning))" }}><Sliders size={16} /></div>
              <span>OpenCode</span>
              <div className={`client-status-dot ${clientConfigs.find(c => c.client_id === "opencode")?.is_enabled ? "active" : "inactive"}`}></div>
            </li>
          </ul>
        </div>
      </aside>

      {/* ============================================================================
          MAIN BODY
         ============================================================================ */}
      <main className="main-content">
        <header className="top-header">
          <div className="page-title">
            <h2>
              {activeTab === "overview" && "系统运行概览"}
              {activeTab === "providers" && "供应商管理"}
              {activeTab === "client_config" && "本地客户端配置接管"}
              {activeTab === "global_prompts" && "一站式原生全局提示词管理"}
              {activeTab === "mcp" && "MCP (Model Context Protocol) 插件"}
              {activeTab === "stats" && "审计分析统计"}
              {activeTab === "settings" && "系统全局设置"}
            </h2>
            <p>
              {activeTab === "overview" && "一站式管理 AI 供应商、模型与使用情况"}
              {activeTab === "providers" && "配置与接管各大 AI 节点通道协议"}
              {activeTab === "models" && "跨账户管理大模型激活列表及自动发现"}
              {activeTab === "client_config" && "自定义 AI 开发工具轮换策略及负载权重"}
              {activeTab === "global_prompts" && "直接管控散落于系统各处的 CLI 原生系统人设"}
              {activeTab === "mcp" && "开启本地/远程 MCP 工具服务器连接"}
              {activeTab === "stats" && "多协议吞吐审计、模型活跃度及 Latency 耗时热图"}
              {activeTab === "settings" && "配置默认接管端口、重试及降级逻辑"}
            </p>
          </div>

          <div className="header-controls">
            <div className="search-bar">
              <Search size={15} style={{ color: "hsl(var(--text-muted))" }} />
              <input placeholder="搜索模型、供应商、Skill..." />
              <span className="search-shortcut">⌘K</span>
            </div>
            <button className="icon-btn" onClick={() => setDarkMode(!darkMode)} title="切换主题">
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="icon-btn" style={{ position: "relative" }} title="通知">
              <Bell size={17} />
              <span style={{ position: "absolute", top: "8px", right: "8px", width: "7px", height: "7px", backgroundColor: "hsl(var(--danger))", borderRadius: "50%" }}></span>
            </button>
          </div>
        </header>

        <section className="tab-panel">
          {/* ============================================================================
              TAB: OVERVIEW (概览)
             ============================================================================ */}
          {activeTab === "overview" && (
            <OverviewTab
              overviewData={overviewData}
              trafficTrend={trafficTrend}
              recentActivities={recentActivities}
              modelUsage={modelUsage}
              statsPeriod={statsPeriod}
              setStatsPeriod={setStatsPeriod}
              heatmapData={heatmapData}
            />
          )}

          {/* ============================================================================
              TAB: PROVIDERS (供应商管理)
             ============================================================================ */}
          {activeTab === "providers" && (
            <ProvidersTab
              importFileInputRef={importFileInputRef}
              handleImportFileChange={handleImportFileChange}
              handleExportProviders={handleExportProviders}
              isExporting={isExporting}
              setShowAddProviderModal={setShowAddProviderModal}
              setWizardStep={setWizardStep}
              providers={providers}
              handleToggleProvider={handleToggleProvider}
              handleOpenProviderConnection={handleOpenProviderConnection}
              handleOpenProviderDetails={handleOpenProviderDetails}
              handleOpenModelMapping={handleOpenModelMapping}
              handleDeleteProvider={handleDeleteProvider}
            />
          )}

          {/* ============================================================================
              TAB: CLIENT CONFIG (客户端配置)
             ============================================================================ */}
          {activeTab === "client_config" && (
            <ClientConfigTab
              clientSubTab={clientSubTab}
              setClientSubTab={setClientSubTab}
              clientConfigs={clientConfigs}
              renderCliMask={renderCliMask}
              handleToggleClient={handleToggleClient}
              handleStrategyChange={handleStrategyChange}
              setAddingProviderForClient={setAddingProviderForClient}
              providers={providers}
              handleMoveProvider={handleMoveProvider}
              handleWeightChange={handleWeightChange}
              showToast={showToast}
              handleToggleClientProvider={handleToggleClientProvider}
              addingProviderForClient={addingProviderForClient}
              addingProviderProtocol={addingProviderProtocol}
              setAddingProviderProtocol={setAddingProviderProtocol}
              addingProviderId={addingProviderId}
              setAddingProviderId={setAddingProviderId}
              setClientConfigs={setClientConfigs}
              hijackProviderName={hijackProviderName}
              setHijackProviderName={setHijackProviderName}
              reapplyProxyConfig={reapplyProxyConfig}
            />
          )}

          {/* ============================================================================
              TAB: GLOBAL PROMPTS (全局提示词)
             ============================================================================ */}
          {activeTab === "global_prompts" && (
            <GlobalPromptsTab
              globalPromptSubTab={globalPromptSubTab}
              setGlobalPromptSubTab={setGlobalPromptSubTab}
              renderCliMask={renderCliMask}
              handleSaveGlobalPrompt={handleSaveGlobalPrompt}
              globalPrompts={globalPrompts}
              setGlobalPrompts={setGlobalPrompts}
            />
          )}



          {/* ============================================================================
              TAB: MCP (MCP 服务管理)
             ============================================================================ */}
          {activeTab === "mcp" && (
            <McpDisplay />
          )}

          {activeTab === "mcp_legacy" && (
            <div>
              <div className="dashboard-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                <div className="panel-card">
                  <div className="card-header-row">
                    <h3>添加新工具 MCP Server</h3>
                  </div>
                  <div className="form-group">
                    <label>MCP 服务名称</label>
                    <input placeholder="e.g. memory-server" value={newMcpName} onChange={(e) => setNewMcpName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>执行命令 (Command)</label>
                    <input placeholder="e.g. node, npx, docker" value={newMcpCmd} onChange={(e) => setNewMcpCmd(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>参数列表 (Args, 用逗号分割)</label>
                    <input placeholder="e.g. -y, @modelcontextprotocol/server-memory" value={newMcpArgs} onChange={(e) => setNewMcpArgs(e.target.value)} />
                  </div>
                  <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleAddMcp}><Plus size={16} /> 一键连接加载</button>
                </div>

                <div className="panel-card">
                  <div className="card-header-row">
                    <h3>已载入的 MCP 扩展组件</h3>
                  </div>
                  <div className="list-group">
                    {mcpServers.map((server, i) => (
                      <div className="list-item-card" key={i} style={{ display: "block", borderLeft: server.is_active ? "3px solid hsl(var(--secondary))" : "3px solid transparent", marginBottom: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <h4 style={{ fontSize: "0.94rem" }}>{server.name}</h4>
                          <div className="switch-container" onClick={() => handleToggleMcp(server.id)}>
                            <div className={`switch-track ${server.is_active ? "active" : ""}`}>
                              <div className="switch-thumb"></div>
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                          <strong>执行指令:</strong> <code style={{ color: "hsl(var(--primary))" }}>{server.command} {server.args.join(" ")}</code>
                        </div>
                        {Object.keys(server.env).length > 0 && (
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "6px" }}>
                            <strong>环境变量:</strong> &nbsp;
                            {Object.entries(server.env).map(([k, v]) => (
                              <span key={k} style={{ display: "inline-block", background: "hsl(var(--border-color))", padding: "2px 6px", borderRadius: "4px", marginRight: "6px" }}>{k}={v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* ============================================================================
              TAB: SETTINGS (系统全局设置)
             ============================================================================ */}
          {activeTab === "settings" && (
            <SettingsTab
              settingsSubTab={settingsSubTab}
              setSettingsSubTab={setSettingsSubTab}
              hijackBaseUrl={hijackBaseUrl}
              setHijackBaseUrl={setHijackBaseUrl}
              generateRandomKey={generateRandomKey}
              hijackApiKey={hijackApiKey}
              setHijackApiKey={setHijackApiKey}
            />
          )}

        </section>
      </main>


      {/* ============================================================================
          MODAL: 供应商导入预览
         ============================================================================ */}
      <ImportPreviewModal
        showImportModal={showImportModal}
        setShowImportModal={setShowImportModal}
        importFileName={importFileName}
        importPreviewList={importPreviewList}
        handleImportAllNew={handleImportAllNew}
        handleImportSingleProvider={handleImportSingleProvider}
      />

      {/* ============================================================================
          MODAL: 模型映射 Modal
         ============================================================================ */}
      <MappingModal
        showMappingModal={showMappingModal}
        setShowMappingModal={setShowMappingModal}
        mappingProvider={mappingProvider}
        mappingModels={mappingModels}
        handleMappingChange={handleMappingChange}
        handleMappingBlur={handleMappingBlur}
        handleDefaultChange={handleDefaultChange}
      />

      {/* ============================================================================
          MODAL: 供应商连接配置
         ============================================================================ */}
      <ConnectionModal
        showProviderConnectionModal={showProviderConnectionModal}
        setShowProviderConnectionModal={setShowProviderConnectionModal}
        editConnectionData={editConnectionData}
        setEditConnectionData={setEditConnectionData}
        showConnectionApiKey={showConnectionApiKey}
        setShowConnectionApiKey={setShowConnectionApiKey}
        handleSaveProviderConnection={handleSaveProviderConnection}
      />

      {/* ============================================================================
          MODAL: ADD PROVIDER (添加供应商四步向导)
         ============================================================================ */}
      {/* ============================================================================
          MODAL: 供应商详情与模型管理
         ============================================================================ */}
      <ProviderDetailsModal
        showProviderDetailsModal={showProviderDetailsModal}
        setShowProviderDetailsModal={setShowProviderDetailsModal}
        selectedProviderForDetails={selectedProviderForDetails}
        setSelectedProviderForDetails={setSelectedProviderForDetails}
        models={models}
        modelsSearchQuery={modelsSearchQuery}
        setModelsSearchQuery={setModelsSearchQuery}
        manualModelName={manualModelName}
        setManualModelName={setManualModelName}
        handleManualAddModel={handleManualAddModel}
        handleOpenPullModal={handleOpenPullModal}
        activeFeatureTab={activeFeatureTab}
        setActiveFeatureTab={setActiveFeatureTab}
        handleDeleteModel={handleDeleteModel}
      />

      <AddProviderModal
        showAddProviderModal={showAddProviderModal}
        setShowAddProviderModal={setShowAddProviderModal}
        wizardStep={wizardStep}
        setWizardStep={setWizardStep}
        newProvName={newProvName}
        setNewProvName={setNewProvName}
        newProvUrl={newProvUrl}
        setNewProvUrl={setNewProvUrl}
        newProvProtocol={newProvProtocol}
        setNewProvProtocol={setNewProvProtocol}
        newProvKey={newProvKey}
        setNewProvKey={setNewProvKey}
        isFetchingModels={isFetchingModels}
        fetchModelsError={fetchModelsError}
        setFetchModelsError={setFetchModelsError}
        handleFetchModels={handleFetchModels}
        handleSaveProviderOnly={handleSaveProviderOnly}
        fetchedModels={fetchedModels}
        wizardSearchQuery={wizardSearchQuery}
        setWizardSearchQuery={setWizardSearchQuery}
        wizardFeatureTab={wizardFeatureTab}
        setWizardFeatureTab={setWizardFeatureTab}
        selectedFetchedModelNames={selectedFetchedModelNames}
        setSelectedFetchedModelNames={setSelectedFetchedModelNames}
        handleAddProviderSubmit={handleAddProviderSubmit}
      />

      <PullModal
        showPullModal={showPullModal}
        setShowPullModal={setShowPullModal}
        selectedProviderForDetails={selectedProviderForDetails}
        fetchedModelsForPull={fetchedModelsForPull}
        setFetchedModelsForPull={setFetchedModelsForPull}
        pullSearchQuery={pullSearchQuery}
        setPullSearchQuery={setPullSearchQuery}
        isSyncingModels={isSyncingModels}
        setIsSyncingModels={setIsSyncingModels}
        pullFeatureTab={pullFeatureTab}
        setPullFeatureTab={setPullFeatureTab}
        models={models}
        setModels={setModels}
        handleDeleteModel={handleDeleteModel}
        loadData={loadData}
      />
    </div>
  );
}

export default App;
