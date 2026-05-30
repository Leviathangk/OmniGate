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
  LineChart,
  Settings,
  Sun,
  Moon,
  Bell,
  Search,
  Plus,
  Check,
  ChevronRight,
  Trash2,
  Database,
  Info,
  Terminal,
  Share2,
  Activity,
  Sparkles,
  Eye,
  Wrench,
  ArrowUpDown,
  Maximize2,
  X,
  Minus,
  ListPlus,
  RotateCw,
  AlertTriangle,
  Zap,
  FileText
} from "lucide-react";
import "./App.css";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ============================================================================
// TypeScript 接口定义
// ============================================================================
interface TrafficPoint { time: string; count: number; avg_latency: number; error_count: number; }
interface RecentActivity { id: string; provider_name: string; model_name: string; status_code: number; latency_ms: number; error_message?: string; created_at: number; protocol?: string; }
interface ModelUsage { name: string; count: number; }
interface HeatmapData { date: string; count: number; }
interface Provider {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  protocol: string;
  is_active: boolean;
  weight: number;
  priority: number;
}

interface Model {
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
}

interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  is_active: boolean;
}

interface Skill {
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
  total_skills: number;
  active_skills: number;
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

interface ClientConfig {
  client_id: string;
  is_enabled: boolean;
  strategy: string;
  retry_count: number;
  timeout_seconds: number;
  providers: Provider[];
}

interface GlobalSettings {
  default_client: string;
  default_strategy: string;
  auto_failover: boolean;
  global_timeout: number;
  global_retry: number;
  global_concurrency: number;
  request_logging: boolean;
}

const getUrlPreview = (url: string, protocol: string) => {
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

interface CustomSelectProps {
  value: string | number;
  options: SelectOption[];
  onChange: (value: any) => void;
  style?: React.CSSProperties;
  width?: string | number;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, options, onChange, style, width = "100%" }) => {
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

const renderModelPullingInterface = (
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


const CustomTrafficTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border-color))', borderRadius: '8px', padding: '10px', fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: 'hsl(var(--text-primary))' }}>{label}</p>
        <p style={{ margin: '4px 0', color: '#10b981' }}>请求总数: <strong>{data.count}</strong></p>
        <p style={{ margin: '4px 0', color: '#ef4444' }}>失败数: <strong>{data.error_count}</strong></p>
        <p style={{ margin: '4px 0', color: 'hsl(var(--text-secondary))' }}>平均延迟: <strong>{Math.round(data.avg_latency)} ms</strong></p>
      </div>
    );
  }
  return null;
};

function App() {
  // ============================================================================
  // 状态定义
  // ============================================================================
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [statsPeriod, setStatsPeriod] = useState<string>("7");
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);
  
  // 核心数据状态
  
  const [trafficTrend, setTrafficTrend] = useState<TrafficPoint[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);

  const [overviewData, setOverviewData] = useState<UsageOverview>({
    total_providers: 0, active_providers: 0,
    total_models: 0, active_models: 0,
    total_skills: 0, active_skills: 0,
    total_mcp: 0, active_mcp: 0,
    today_requests: 0, today_requests_growth: "+0%",
    today_tokens: "0", today_tokens_growth: "+0%"
  });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

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
    {
      client_id: "claude",
      is_enabled: false,
      strategy: "priority",
      retry_count: 2,
      timeout_seconds: 30,
      providers: [],
    },
    {
      client_id: "codex",
      is_enabled: false,
      strategy: "priority",
      retry_count: 3,
      timeout_seconds: 45,
      providers: [],
    },
    {
      client_id: "opencode",
      is_enabled: false,
      strategy: "priority",
      retry_count: 2,
      timeout_seconds: 30,
      providers: [],
    },
  ]);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    default_client: "Claude",
    default_strategy: "随机切换 (负载均衡)",
    auto_failover: true,
    global_timeout: 60,
    global_retry: 2,
    global_concurrency: 10,
    request_logging: true,
  });

  const [clientSubTab, setClientSubTab] = useState<string>("claude");
  const [settingsSubTab, setSettingsSubTab] = useState<string>("general");
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
  
  // 新建 Skill 状态
  const [newSkillName, setNewSkillName] = useState<string>("");
  const [newSkillDesc, setNewSkillDesc] = useState<string>("");
  const [newSkillPrompt, setNewSkillPrompt] = useState<string>("");
  
  // 技能编辑器活动对象
  const [editingSkillId, setEditingSkillId] = useState<string>("s1");
  const [skillEditorContent, setSkillEditorContent] = useState<string>("");

  // 供应商详情与模型管理弹窗状态
  const [selectedProviderForDetails, setSelectedProviderForDetails] = useState<Provider | null>(null);
  const [showProviderDetailsModal, setShowProviderDetailsModal] = useState<boolean>(false);
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

  const handleHijackCodex = () => {
    if (!hijackApiKey) {
      alert("请先生成或输入接管凭证 (Proxy API Key)");
      return;
    }
    invoke("hijack_codex_config", {
      providerName: hijackProviderName,
      baseUrl: hijackBaseUrl,
      proxyApiKey: hijackApiKey
    }).then(() => {
      alert("Codex 配置文件修改成功，已接管！");
    }).catch(e => {
      alert(`接管失败: ${e}`);
    });
  };

  const [isClientConfigsLoaded, setIsClientConfigsLoaded] = useState(false);

  // 加载核心数据（从真实 SQLite 后端）
  const loadData = async () => {
    try {
      const [overview, provList, mcpList, skillList, loadedClientConfigs, traffic, recent, dist, heatmap] = await Promise.all([
        invoke<UsageOverview>("get_usage_overview"),
        invoke<Provider[]>("get_providers"),
        invoke<McpServer[]>("get_mcp_servers"),
        invoke<Skill[]>("get_skills"),
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
      setSkills(skillList);
      if (skillList.length > 0) {
        const first = skillList[0];
        setEditingSkillId(first.id);
        setSkillEditorContent(first.content);
      }
      let targetConfigs = loadedClientConfigs;
      if (loadedClientConfigs && loadedClientConfigs.length > 0) {
        setClientConfigs(loadedClientConfigs);
      } else {
        // Init with default configs if DB is empty
        await invoke("save_client_configs", { configs: clientConfigs });
        targetConfigs = clientConfigs;
      }
      
      // 保证应用启动时配置文件的一致性
      if (targetConfigs) {
        const codexCfg = targetConfigs.find((c: ClientConfig) => c.client_id === "codex");
        if (codexCfg && codexCfg.is_enabled) {
          // 如果启动时状态是开启的，为了防止文件被人为修改或未生效，强制刷新接管
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
          // 如果启动时状态是关闭的，强制执行还原操作清除接管
          invoke("restore_codex_config").catch(console.error);
        }
      }
      
      setIsClientConfigsLoaded(true);
    } catch (err) {
      console.error("加载数据失败:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 自动保存客户端配置
  useEffect(() => {
    if (isClientConfigsLoaded) {
      invoke("save_client_configs", { configs: clientConfigs })
        .catch(e => console.error("自动保存客户端配置失败:", e));
    }
  }, [clientConfigs, isClientConfigsLoaded]);

  // 当选择 of 编辑技能变化时
  useEffect(() => {
    const activeSkill = skills.find(s => s.id === editingSkillId);
    if (activeSkill) {
      setSkillEditorContent(activeSkill.content);
    }
  }, [editingSkillId, skills]);

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





  const handleToggleClient = async (clientId: string) => {
    const config = clientConfigs.find(c => c.client_id === clientId);
    if (!config) return;
    const newEnabledState = !config.is_enabled;

    setClientConfigs(prev => prev.map(c => c.client_id === clientId ? { ...c, is_enabled: newEnabledState } : c));

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
            // Give it a tiny delay to wait for random key generation if it was just loaded
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
          // 还原状态
          setClientConfigs(prev => prev.map(c => c.client_id === clientId ? { ...c, is_enabled: false } : c));
        }
      }
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

  const handleToggleSkill = (id: string) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, is_active: !s.is_active } : s));
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

  // 添加 Skill 技能
  const handleAddSkill = () => {
    if (!newSkillName || !newSkillPrompt) return;
    const newSkill: Skill = {
      id: "skill_" + Math.random().toString(36).substring(7),
      name: newSkillName,
      description: newSkillDesc || "自定义技能",
      content: newSkillPrompt,
      is_active: true
    };
    setSkills(prev => [...prev, newSkill]);
    setOverviewData(prev => ({
      ...prev,
      total_skills: prev.total_skills + 1,
      active_skills: prev.active_skills + 1
    }));
    setNewSkillName("");
    setNewSkillDesc("");
    setNewSkillPrompt("");
    alert("Skill 技能添加成功！");
  };

  // 保存技能 prompt 调整
  const handleSaveSkillPrompt = () => {
    setSkills(prev => prev.map(s => s.id === editingSkillId ? { ...s, content: skillEditorContent } : s));
    alert("技能提示词保存成功！");
  };

  return (
    <div className="app-container">
      {/* 顶部居中 Toast 弹窗 */}
      {toastMessage && (
        <div style={{
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "hsl(var(--danger))",
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
          <AlertTriangle size={18} />
          {toastMessage}
        </div>
      )}

      {/* ============================================================================
          SIDEBAR NAVIGATION (Vector Lucide Icons)
         ============================================================================ */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon">Ω</div>
          <div className="logo-info">
            <h1>OmniGate</h1>
            <span>AI账号轮换管理器 v0.1.0</span>
          </div>
        </div>

        <div className="menu-section">
          <div className="menu-title">控制台</div>
          <ul className="menu-list">
            <li className={`menu-item ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
              <div className="menu-icon"><LayoutDashboard size={17} /></div>
              <span>核心概览</span>
            </li>
            <li className={`menu-item ${activeTab === "providers" ? "active" : ""}`} onClick={() => setActiveTab("providers")}>
              <div className="menu-icon"><Server size={17} /></div>
              <span>供应商管理</span>
            </li>
            <li className={`menu-item ${activeTab === "client_config" ? "active" : ""}`} onClick={() => setActiveTab("client_config")}>
              <div className="menu-icon"><Sliders size={17} /></div>
              <span>客户端配置</span>
            </li>
            <li className={`menu-item ${activeTab === "skills" ? "active" : ""}`} onClick={() => setActiveTab("skills")}>
              <div className="menu-icon"><Brain size={17} /></div>
              <span>Skill 技能管理</span>
            </li>
            <li className={`menu-item ${activeTab === "mcp" ? "active" : ""}`} onClick={() => setActiveTab("mcp")}>
              <div className="menu-icon"><Boxes size={17} /></div>
              <span>MCP 服务管理</span>
            </li>
          </ul>
        </div>

        <div className="menu-section">
          <div className="menu-title">数据审计</div>
          <ul className="menu-list">
            <li className={`menu-item ${activeTab === "stats" ? "active" : ""}`} onClick={() => setActiveTab("stats")}>
              <div className="menu-icon"><LineChart size={17} /></div>
              <span>使用统计</span>
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
              {activeTab === "skills" && "Skill 技能提示词中心"}
              {activeTab === "mcp" && "MCP (Model Context Protocol) 插件"}
              {activeTab === "stats" && "审计分析统计"}
              {activeTab === "settings" && "系统全局设置"}
            </h2>
            <p>
              {activeTab === "overview" && "一站式管理 AI 供应商、模型与使用情况"}
              {activeTab === "providers" && "配置与接管各大 AI 节点通道协议"}
              {activeTab === "models" && "跨账户管理大模型激活列表及自动发现"}
              {activeTab === "client_config" && "自定义 AI 开发工具轮换策略及负载权重"}
              {activeTab === "skills" && "定制专属 AI 代码评审、SQL 调优及 Regex 脚本"}
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
            <div>
              <div className="card-grid-4">
                <div className="stat-card purple">
                  <div className="stat-icon-container"><Server size={20} /></div>
                  <div className="stat-info">
                    <p>已接管供应商</p>
                    <h3>{overviewData.total_providers} 个</h3>
                    <div className="stat-sub">当前启用: <strong>{overviewData.active_providers} 个</strong></div>
                  </div>
                </div>
                <div className="stat-card blue">
                  <div className="stat-icon-container"><Cpu size={20} /></div>
                  <div className="stat-info">
                    <p>总模型矩阵</p>
                    <h3>{overviewData.total_models} 个</h3>
                    <div className="stat-sub">轮换可用: <strong>{overviewData.active_models} 个</strong></div>
                  </div>
                </div>
                <div className="stat-card green">
                  <div className="stat-icon-container"><Brain size={20} /></div>
                  <div className="stat-info">
                    <p>Skill 技能数</p>
                    <h3>{overviewData.total_skills} 个</h3>
                    <div className="stat-sub">已启用: <strong>{overviewData.active_skills} 个</strong></div>
                  </div>
                </div>
                <div className="stat-card orange">
                  <div className="stat-icon-container"><Boxes size={20} /></div>
                  <div className="stat-info">
                    <p>MCP 服务端</p>
                    <h3>{overviewData.total_mcp} 个</h3>
                    <div className="stat-sub">已连接: <strong>{overviewData.active_mcp} 个</strong></div>
                  </div>
                </div>
              </div>

              <div className="dashboard-grid">
                <div className="left-column">
                  <div className="panel-card">
                    <div className="card-header-row">
                      <h3>今日流量走势</h3>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <span className="status-badge success" style={{ fontSize: "0.7rem", padding: "2px 8px" }}>实时更新</span>
                      </div>
                    </div>
                    <div style={{ width: '100%', height: '250px', marginTop: '20px' }}>
                      {trafficTrend.length === 0 ? (
                         <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.8rem", height: "100%" }}>
                            <span>暂无流量走势数据</span>
                         </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trafficTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="time" stroke="hsl(var(--text-muted))" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="hsl(var(--text-muted))" fontSize={12} tickLine={false} axisLine={false} />
                            <RechartsTooltip content={<CustomTrafficTooltip />} />
                            <Area type="monotone" dataKey="count" stroke="#10b981" fillOpacity={1} fill="url(#colorCount)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  
                  <div className="panel-card">
                    <div className="card-header-row">
                      <h3>最近转发活动</h3>
                    </div>
                    <div className="table-container" style={{ marginTop: '16px' }}>
                      <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid hsl(var(--border-color))', color: 'hsl(var(--text-muted))' }}>
                            <th style={{ padding: '8px', width: '80px' }}>来源</th>
                            <th style={{ padding: '8px' }}>状态</th>
                            <th style={{ padding: '8px' }}>模型</th>
                            <th style={{ padding: '8px' }}>供应商</th>
                            <th style={{ padding: '8px' }}>延迟</th>
                            <th style={{ padding: '8px', whiteSpace: 'nowrap' }}>发出时间</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentActivities.map((act, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid hsl(var(--border-color))' }}>
                              <td style={{ padding: '8px' }}>
                                {act.protocol === 'claude' && <span title="Claude" style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', fontSize: '0.7rem', fontWeight: 'bold' }}>Claude</span>}
                                {act.protocol === 'codex_responses' && <span title="Codex" style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontSize: '0.7rem', fontWeight: 'bold' }}>Codex</span>}
                                {act.protocol === 'codex_chat' && <span title="OpenCode" style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: '0.7rem', fontWeight: 'bold' }}>OpenCode</span>}
                                {(!act.protocol) && <span style={{ color: 'hsl(var(--text-muted))' }}>-</span>}
                              </td>
                              <td style={{ padding: '8px' }}>
                                <span className={`status-badge ${act.status_code === 200 ? 'success' : 'error'}`} style={{ fontSize: '0.7rem' }}>
                                  {act.status_code}
                                </span>
                              </td>
                              <td style={{ padding: '8px', color: 'hsl(var(--text-primary))' }}>{act.model_name}</td>
                              <td style={{ padding: '8px', color: 'hsl(var(--text-secondary))' }}>{act.provider_name}</td>
                              <td style={{ padding: '8px', fontFamily: 'monospace' }}>{act.latency_ms}ms</td>
                              <td style={{ padding: '8px', color: 'hsl(var(--text-secondary))', fontSize: '0.8rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                {(() => {
                                  const d = new Date(act.created_at * 1000);
                                  const pad = (n: number) => n.toString().padStart(2, '0');
                                  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                                })()}
                              </td>
                            </tr>
                          ))}
                          {recentActivities.length === 0 && (
                            <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>暂无请求记录</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="right-column">
                  <div className="panel-card">
                    <div className="card-header-row">
                      <h3>使用分布 (按模型)</h3>
                    </div>
                    <div style={{ width: '100%', height: '220px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      {modelUsage.length === 0 ? (
                         <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                            <span>暂无使用分布数据</span>
                         </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={modelUsage}
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="count"
                              nameKey="name"
                            >
                              {modelUsage.map((_entry, index) => {
                                const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
                                return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                              })}
                            </Pie>
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', borderColor: 'hsl(var(--border-color))', borderRadius: '8px', color: 'hsl(var(--text-primary))' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    {/* Legend */}
                    {modelUsage.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginTop: '10px' }}>
                        {modelUsage.map((m, i) => {
                          const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>
                              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: COLORS[i % COLORS.length] }}></div>
                              {m.name} ({m.count})
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  
                  
                  <div className="panel-card">
                    <div className="card-header-row">
                      <h3>活跃度热力图 (近半年)</h3>
                    </div>
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {heatmapData.length === 0 ? (
                         <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.8rem", height: "100px" }}>
                            <span>暂无请求记录</span>
                         </div>
                      ) : (
                        <div className="heatmap-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12px, 1fr))', gap: '4px', overflowX: 'auto' }}>
                          {heatmapData.map((d, i) => {
                            let opacity = 0.2;
                            if (d.count > 0) opacity = 0.4;
                            if (d.count > 50) opacity = 0.6;
                            if (d.count > 200) opacity = 0.8;
                            if (d.count > 500) opacity = 1.0;
                            return (
                              <div key={i} title={`${d.date}: ${d.count} 次请求`} style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: `rgba(16, 185, 129, ${opacity})`, cursor: 'pointer' }} />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

</div>
          )}

          {/* ============================================================================
              TAB: PROVIDERS (供应商管理)
             ============================================================================ */}
          {activeTab === "providers" && (
            <div className="panel-card">
              <div className="card-header-row">
                <h3>已接管的 AI 供应商列表</h3>
                <button className="btn-primary" onClick={() => { setShowAddProviderModal(true); setWizardStep(1); }}><Plus size={16} /> 添加新供应商</button>
              </div>

              <div className="responsive-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>供应商名称</th>
                      <th>API 基础 URL</th>
                      <th>协议类型</th>
                      <th>启用状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)", fontSize: "0.82rem" }}>暂无供应商 — 点击右上角 + 按钮添加</td></tr>
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
                          <div className="switch-container" onClick={() => handleToggleProvider(p)}>
                            <div className={`switch-track ${p.is_active ? "active" : ""}`}>
                              <div className="switch-thumb"></div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "0.72rem", marginRight: "8px" }} onClick={() => handleOpenProviderDetails(p)}>详情与模型</button>
                          <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "0.72rem", color: "hsl(var(--danger))", borderColor: "hsl(var(--danger) / 0.2)" }} onClick={() => handleDeleteProvider(p.id)}><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}

                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================================================
              TAB: CLIENT CONFIG (客户端配置)
             ============================================================================ */}
          {activeTab === "client_config" && (
            <div>
              <div className="tabs-control-row">
                <button className={`tab-select-btn ${clientSubTab === "claude" ? "active" : ""}`} onClick={() => setClientSubTab("claude")}>Claude 客户端配置</button>
                <button className={`tab-select-btn ${clientSubTab === "codex" ? "active" : ""}`} onClick={() => setClientSubTab("codex")}>Codex 客户端配置</button>
                <button className={`tab-select-btn ${clientSubTab === "opencode" ? "active" : ""}`} onClick={() => setClientSubTab("opencode")}>OpenCode 客户端配置</button>
              </div>

              {clientConfigs.filter(c => c.client_id === clientSubTab).map((config, index) => (
                <div className="panel-card" key={index}>
                  <div className="card-header-row" style={{ borderBottom: "1px solid hsl(var(--border-color))", paddingBottom: "16px", marginBottom: "20px" }}>
                    <div>
                      <h3 style={{ textTransform: "capitalize", fontSize: "1.2rem" }}>{config.client_id} 接管代理</h3>
                      <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "2px" }}>开启后本地客户端的流量将会经过 OmniGate 分流轮换</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: "600" }}>接管状态:</span>
                      <div className="switch-container" onClick={() => handleToggleClient(config.client_id)}>
                        <div className={`switch-track ${config.is_enabled ? "active" : ""}`}>
                          <div className="switch-thumb"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="priority-config-container">
                    <div>
                      <h4 style={{ fontSize: "0.88rem", fontWeight: "600", marginBottom: "12px" }}>供应商使用策略</h4>
                      <div className="strategy-row">
                        <div className={`strategy-card ${config.strategy === "random" ? "active" : ""}`} onClick={() => handleStrategyChange(config.client_id, "random")}>
                          <h4>🎲 随机切换 (负载均衡)</h4>
                          <p>根据设置的权重在所有启用的供应商中进行分配，实现最优防风控策略。</p>
                        </div>
                        <div className={`strategy-card ${config.strategy === "priority" ? "active" : ""}`} onClick={() => handleStrategyChange(config.client_id, "priority")}>
                          <h4>📶 优先级顺序</h4>
                          <p>严格按照优先级降序（权重顺序）发起请求，当前首选失效时自动启用降级供应商。</p>
                        </div>
                        <div className={`strategy-card ${config.strategy === "manual" ? "active" : ""}`} onClick={() => handleStrategyChange(config.client_id, "manual")}>
                          <h4>📌 手动选择</h4>
                          <p>固定指定某一个特定账号作为唯一转发终点，不开启轮换模式。</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="card-header-row" style={{ marginBottom: "10px" }}>
                        <h4 style={{ fontSize: "0.88rem", fontWeight: "600" }}>供应商列表及权重分配</h4>
                        <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.76rem" }} onClick={() => setAddingProviderForClient(config.client_id)}><Plus size={14} /> 添加新成员</button>
                      </div>

                      <div className="responsive-table-container">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th style={{ width: "80px" }}>优先级</th>
                              <th>供应商</th>
                              <th>运行状态</th>
                              <th style={{ width: "200px" }}>轮换权重 (Weight)</th>
                              <th>启用状态</th>
                            </tr>
                          </thead>
                          <tbody>
                            {config.providers.map((p, pIndex) => (
                              <tr key={pIndex}>
                                <td>
                                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                                    <button 
                                      className="btn-secondary" 
                                      style={{ padding: "2px 4px", fontSize: "0.6rem" }} 
                                      disabled={pIndex === 0}
                                      onClick={() => handleMoveProvider(config.client_id, pIndex, -1)}
                                    >↑</button>
                                    <button 
                                      className="btn-secondary" 
                                      style={{ padding: "2px 4px", fontSize: "0.6rem" }} 
                                      disabled={pIndex === config.providers.length - 1}
                                      onClick={() => handleMoveProvider(config.client_id, pIndex, 1)}
                                    >↓</button>
                                  </div>
                                </td>
                                <td style={{ fontWeight: "600" }}>
                                  {p.name}
                                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>{p.api_url}</div>
                                </td>
                                <td>
                                  <span className="status-badge success">
                                    可用
                                  </span>
                                </td>
                                <td>
                                  <input type="number" min="1" value={p.weight} onChange={(e) => handleWeightChange(config.client_id, p.id, Number(e.target.value))} style={{ width: "80px", padding: "4px 8px", borderRadius: "4px", border: "1px solid hsl(var(--border-color))", backgroundColor: "hsl(var(--bg-card))", color: "hsl(var(--text-primary))" }} />
                                </td>
                                <td>
                                  <div className="switch-container" onClick={() => handleToggleClientProvider(config.client_id, p.id)}>
                                    <div className={`switch-track ${p.is_active ? "active" : ""}`}>
                                      <div className="switch-thumb"></div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {addingProviderForClient === config.client_id && (
                              <tr>
                                <td colSpan={2}>
                                  <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                                    <div style={{ flex: "0 0 160px" }}>
                                      <CustomSelect
                                        value={addingProviderProtocol}
                                        onChange={(v) => {
                                          setAddingProviderProtocol(v);
                                          setAddingProviderId("");
                                        }}
                                        options={[
                                          { label: "选择协议", value: "" },
                                          ...(config.client_id === "claude" ? [{ label: "Claude 协议", value: "claude" }] : []),
                                          ...(config.client_id === "codex" ? [{ label: "Codex /responses", value: "codex_responses" }] : []),
                                          ...(config.client_id === "opencode" ? [
                                            { label: "Claude 协议", value: "claude" },
                                            { label: "Codex /responses", value: "codex_responses" },
                                            { label: "Codex /chat", value: "codex_chat" }
                                          ] : [])
                                        ]}
                                      />
                                    </div>
                                    <div style={{ flex: "1" }}>
                                      <CustomSelect
                                        value={addingProviderId}
                                        onChange={(v) => {
                                          setAddingProviderId(v);
                                          // 延迟执行添加，因为 setState 是异步的
                                          setTimeout(() => {
                                            if (v) {
                                              const provider = providers.find(p => p.id === v);
                                              if (provider) {
                                                setClientConfigs(prev => prev.map(c => {
                                                  if (c.client_id === config.client_id) {
                                                    if (c.providers.some(p => p.id === provider.id)) return c;
                                                    return { ...c, providers: [...c.providers, { ...provider, weight: 1, is_active: true }] };
                                                  }
                                                  return c;
                                                }));
                                                setAddingProviderForClient(null);
                                                setAddingProviderProtocol("");
                                                setAddingProviderId("");
                                              }
                                            }
                                          }, 0);
                                        }}
                                        options={[
                                          { label: "请选择供应商...", value: "" },
                                          ...providers
                                            .filter(p => p.protocol === addingProviderProtocol && !config.providers.some(cp => cp.id === p.id))
                                            .map(p => ({ label: p.name, value: p.id }))
                                        ]}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td>-</td>
                                <td>-</td>
                                <td>
                                  <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "0.72rem" }} onClick={() => setAddingProviderForClient(null)}>取消</button>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "16px" }}>
                      <div className="form-group">
                        <label>单点请求超时限制</label>
                        <CustomSelect 
                          value={config.timeout_seconds} 
                          onChange={(v) => {
                            const newTimeout = Number(v);
                            setClientConfigs(prev => prev.map(c => c.client_id === config.client_id ? { ...c, timeout_seconds: newTimeout } : c));
                          }}
                          options={[
                            { value: 30, label: "30 秒" },
                            { value: 60, label: "60 秒" },
                            { value: 120, label: "120 秒" },
                            { value: 300, label: "300 秒" }
                          ]}
                        />
                      </div>
                      <div className="form-group">
                        <label>首选失败重试上限</label>
                        <CustomSelect 
                          value={config.retry_count} 
                          onChange={(v) => {
                            const newRetry = Number(v);
                            setClientConfigs(prev => prev.map(c => c.client_id === config.client_id ? { ...c, retry_count: newRetry } : c));
                          }}
                          options={[
                            { value: 0, label: "不重试" },
                            { value: 1, label: "重试 1 次" },
                            { value: 2, label: "重试 2 次" },
                            { value: 3, label: "重试 3 次" }
                          ]}
                        />
                      </div>
                      
                      {config.client_id === "codex" && (
                        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                          <label style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Provider 名称 (model_provider)</span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>自动读取: {hijackProviderName || "无"}</span>
                          </label>
                          <input 
                            type="text" 
                            className="modal-input" 
                            value={hijackProviderName} 
                            onChange={e => {
                              setHijackProviderName(e.target.value);
                              if (config.is_enabled) {
                                setToastMessage("修改 Provider 名称后，必须重新关闭并开启上方「接管状态」才能在本地文件中生效！");
                              }
                            }} 
                            placeholder="custom" 
                          />
                          <div style={{ marginTop: "8px", padding: "8px 12px", backgroundColor: "hsl(var(--warning) / 0.1)", border: "1px solid hsl(var(--warning) / 0.3)", borderRadius: "6px" }}>
                            <span style={{ fontSize: "0.8rem", color: "hsl(var(--warning))", display: "flex", alignItems: "center", gap: "6px" }}>
                              <AlertTriangle size={14} /> <strong>警告：</strong>修改该项可能导致 Codex 历史会话丢失，强烈不建议修改。
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid hsl(var(--border-color))", display: "flex", alignItems: "center", gap: "8px" }}>
                      <FileText size={16} style={{ color: "var(--text-muted)" }} />
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        <strong>目标配置文件目录:</strong> <code style={{ backgroundColor: "hsl(var(--bg-app))", padding: "2px 6px", borderRadius: "4px" }}>{config.client_id === "claude" ? "~/.claude" : config.client_id === "codex" ? "~/.codex" : "~/.opencode"}</code>
                      </span>
                    </div>

                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ============================================================================
              TAB: SKILLS (技能管理)
             ============================================================================ */}
          {activeTab === "skills" && (
            <div>
              <div className="dashboard-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                <div className="panel-card">
                  <div className="card-header-row">
                    <h3>添加新自定义技能 Prompt</h3>
                  </div>
                  <div className="form-group">
                    <label>技能名称 (Unique Name)</label>
                    <input placeholder="e.g. Markdown Translator" value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>描述信息</label>
                    <input placeholder="简述该技能提示词的作用..." value={newSkillDesc} onChange={(e) => setNewSkillDesc(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>核心 Prompt 指令内容</label>
                    <textarea className="editor-textarea" style={{ width: "100%", height: "180px", fontFamily: "inherit" }} placeholder="当该技能被触发时，注入的全局 system prompt..." value={newSkillPrompt} onChange={(e) => setNewSkillPrompt(e.target.value)}></textarea>
                  </div>
                  <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleAddSkill}><Plus size={16} /> 添加到本地矩阵</button>
                </div>

                <div className="panel-card">
                  <div className="card-header-row">
                    <h3>已导入 Skills 技能列表</h3>
                  </div>
                  <div className="list-group">
                    {skills.map((s, i) => (
                      <div className="list-item-card" key={i} style={{ borderLeft: s.is_active ? "3px solid hsl(var(--primary))" : "3px solid transparent" }}>
                        <div className="list-item-info">
                          <h4>{s.name}</h4>
                          <p>{s.description}</p>
                        </div>
                        <div className="list-item-controls">
                          <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", cursor: "pointer", textDecoration: "underline" }} onClick={() => setEditingSkillId(s.id)}>编辑指令</span>
                          <div className="switch-container" onClick={() => handleToggleSkill(s.id)}>
                            <div className={`switch-track ${s.is_active ? "active" : ""}`}>
                              <div className="switch-thumb"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 实时指令 Prompt 交互式编辑器 */}
              <div className="panel-card" style={{ marginTop: "24px" }}>
                <div className="card-header-row" style={{ borderBottom: "1px solid hsl(var(--border-color))", paddingBottom: "16px", marginBottom: "20px" }}>
                  <div>
                    <h3>交互式技能提示词编辑器</h3>
                    <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "2px" }}>在下方可实时微调修改已载入技能的指令框架</p>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <CustomSelect 
                      value={editingSkillId} 
                      onChange={(v) => setEditingSkillId(v)} 
                      options={skills.map(s => ({ value: s.id, label: s.name }))}
                      width="160px"
                    />
                    <button className="btn-primary" onClick={handleSaveSkillPrompt}><Check size={16} /> 保存修改</button>
                  </div>
                </div>

                <div className="editor-container" style={{ height: "260px", gridTemplateColumns: "1fr" }}>
                  <textarea className="editor-textarea" value={skillEditorContent} onChange={(e) => setSkillEditorContent(e.target.value)} placeholder="核心 system prompt 载入中..."></textarea>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================================
              TAB: MCP (MCP 服务管理)
             ============================================================================ */}
          {activeTab === "mcp" && (
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
              TAB: STATS (数据审计统计)
             ============================================================================ */}
          {activeTab === "stats" && (
            <div>
              <div className="tabs-control-row">
                <button className="tab-select-btn active">调用热力图 (Heatmap)</button>
                <button className="tab-select-btn" onClick={() => alert("功能开发中，可在热力图中直观查看趋势！")}>总览走势</button>
                <button className="tab-select-btn" onClick={() => alert("功能开发中！")}>模型分析</button>
                <button className="tab-select-btn" onClick={() => alert("功能开发中！")}>渠道分析</button>
              </div>

              <div className="panel-card">
                <div className="card-header-row">
                  <div>
                    <h3>大模型调用密度热力图 (24H × 7D)</h3>
                    <p style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>最近 7 天内不同小时时段的调用频次网格</p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", fontSize: "0.8rem", color: "var(--text-secondary)", alignItems: "center" }}>
                    <span>筛选周期:</span>
                    <CustomSelect 
                      value={statsPeriod} 
                      onChange={(v) => setStatsPeriod(v)} 
                      options={[
                        { value: "7", label: "最近 7 天" },
                        { value: "30", label: "最近 30 天" }
                      ]}
                      width="120px"
                    />
                  </div>
                </div>

                <div className="heatmap-grid">
                  <div className="heatmap-days-col">
                    <span>周一</span>
                    <span>周二</span>
                    <span>周三</span>
                    <span>周四</span>
                    <span>周五</span>
                    <span>周六</span>
                    <span>周日</span>
                  </div>
                  <div>
                    <svg className="heatmap-svg" viewBox="0 0 740 180">
                      <g transform="translate(10, 10)">
                        {/* Generate 24 Columns for hours, 7 Rows for days */}
                        {Array.from({ length: 24 }).map((_, colIdx) => (
                          <g key={colIdx} transform={`translate(${colIdx * 28}, 0)`}>
                            {Array.from({ length: 7 }).map((_, rowIdx) => {
                              // Generate realistic gradient colors
                              let opacity = 0.05;
                              const hour = colIdx;
                              // Wed has high volume
                              if (rowIdx === 2) opacity += 0.3;
                              // Peak times 14:00 - 16:00
                              if (hour >= 14 && hour <= 16) opacity += 0.45;
                              // Night drops
                              if (hour >= 0 && hour <= 6) opacity -= 0.1;
                              // Clamp opacity
                              opacity = Math.max(0.05, Math.min(0.9, opacity));
                              
                              return (
                                <rect key={rowIdx} y={rowIdx * 22} width="22" height="18" className="heatmap-rect" fill={`rgba(168, 85, 247, ${opacity})`} />
                              );
                            })}
                            <text x="11" y="165" textAnchor="middle" fill="var(--text-muted)" fontSize="8px">{colIdx.toString().padStart(2, '0')}:00</text>
                          </g>
                        ))}
                      </g>
                    </svg>
                  </div>
                </div>

                <div className="heatmap-legend-row">
                  <span>较少</span>
                  <div className="heatmap-legend-blocks">
                    <span className="legend-block" style={{ backgroundColor: "rgba(168, 85, 247, 0.05)" }}></span>
                    <span className="legend-block" style={{ backgroundColor: "rgba(168, 85, 247, 0.25)" }}></span>
                    <span className="legend-block" style={{ backgroundColor: "rgba(168, 85, 247, 0.5)" }}></span>
                    <span className="legend-block" style={{ backgroundColor: "rgba(168, 85, 247, 0.75)" }}></span>
                    <span className="legend-block" style={{ backgroundColor: "rgba(168, 85, 247, 0.9)" }}></span>
                  </div>
                  <span>较多</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                <div className="panel-card">
                  <h4>🔥 高峰活跃时段</h4>
                  <h3 style={{ fontSize: "2rem", fontFamily: "var(--font-display)", fontWeight: "700", marginTop: "12px", background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>14:00 - 16:00</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "6px" }}>在此区间平均吞吐速度达 <strong>245 次请求/小时</strong></p>
                </div>
                <div className="panel-card">
                  <h4>🗓️ 最活跃星期日期</h4>
                  <h3 style={{ fontSize: "2rem", fontFamily: "var(--font-display)", fontWeight: "700", marginTop: "12px", color: "hsl(var(--success))" }}>星期三</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "6px" }}>周三全天调用量峰值累计达到 <strong>2,451 次请求</strong></p>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================================
              TAB: SETTINGS (系统全局设置)
             ============================================================================ */}
          {activeTab === "settings" && (
            <div>
              <div className="tabs-control-row">
                <button className={`tab-select-btn ${settingsSubTab === "proxy" ? "active" : ""}`} onClick={() => setSettingsSubTab("proxy")}>本地网关接管</button>
                <button className={`tab-select-btn ${settingsSubTab === "client" ? "active" : ""}`} onClick={() => setSettingsSubTab("client")}>客户端全局</button>
                <button className={`tab-select-btn ${settingsSubTab === "database" ? "active" : ""}`} onClick={() => setSettingsSubTab("database")}>数据库管理</button>
                <button className={`tab-select-btn ${settingsSubTab === "about" ? "active" : ""}`} onClick={() => setSettingsSubTab("about")}>关于</button>
              </div>

              {settingsSubTab === "proxy" && (
                <div className="panel-card">
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "8px" }}>本地网关与客户端接管 (Codex)</h3>
                  <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)", marginBottom: "20px" }}>通过修改本地配置文件，优雅接管 Codex 流量到 OmniGate 代理网关。</p>
                  
                  <div className="form-group" style={{ marginBottom: "16px" }}>
                    <label>代理服务基础 URL</label>
                    <input 
                      type="text" 
                      className="modal-input" 
                      value={hijackBaseUrl} 
                      onChange={e => setHijackBaseUrl(e.target.value)} 
                      placeholder="http://127.0.0.1:3456" 
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: "24px" }}>
                    <label style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>接管凭证 (Proxy API Key)</span>
                      <button className="btn-secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={generateRandomKey}>
                        随机生成
                      </button>
                    </label>
                    <input 
                      type="text" 
                      className="modal-input" 
                      value={hijackApiKey} 
                      onChange={e => setHijackApiKey(e.target.value)} 
                      placeholder="点击右上角随机生成..." 
                    />
                  </div>

                  <button className="btn-primary" onClick={handleHijackCodex} style={{ width: "100%", justifyContent: "center", padding: "12px" }}>
                    <Zap size={16} /> 一键接管 Codex 配置
                  </button>
                </div>
              )}

              {settingsSubTab === "general" && (
                <div className="panel-card">
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "20px" }}>全局代理首选项</h3>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                    <div className="form-group">
                      <label>默认接管客户端</label>
                      <CustomSelect 
                        value={globalSettings.default_client} 
                        onChange={(v) => setGlobalSettings(prev => ({ ...prev, default_client: v }))}
                        options={[
                          { value: "Claude", label: "Claude Desktop / CLI" },
                          { value: "Codex Responses", label: "Codex Responses" },
                          { value: "Codex Chat", label: "Codex Chat" },
                          { value: "OpenCode", label: "OpenCode" }
                        ]}
                      />
                    </div>

                    <div className="form-group">
                      <label>全局负载策略</label>
                      <CustomSelect 
                        value={globalSettings.default_strategy} 
                        onChange={(v) => setGlobalSettings(prev => ({ ...prev, default_strategy: v }))}
                        options={[
                          { value: "随机切换 (负载均衡)", label: "随机切换 (负载均衡)" },
                          { value: "优先级顺序", label: "优先级顺序" },
                          { value: "手动选择", label: "手动选择" }
                        ]}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid hsl(var(--border-color))", paddingTop: "20px", marginTop: "10px" }}>
                    <div>
                      <h4 style={{ fontSize: "0.86rem", fontWeight: "600" }}>故障自动断路降级</h4>
                      <p style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>当上游供应商通道遇到 429 或网络拥堵时，自动切换至降级供应商</p>
                    </div>
                    <div className="switch-container" onClick={() => setGlobalSettings(prev => ({ ...prev, auto_failover: !prev.auto_failover }))}>
                      <div className={`switch-track ${globalSettings.auto_failover ? "active" : ""}`}>
                        <div className="switch-thumb"></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {settingsSubTab === "database" && (
                <div className="panel-card">
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "16px" }}>持久化存储数据库</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "20px" }}>OmniGate 正在使用高安全级别本地 SQLite 事务存储。主键 UUID 已根据协议完美去除连字符。</p>
                  
                  <div style={{ padding: "16px", backgroundColor: "hsl(var(--bg-app))", borderRadius: "8px", border: "1px solid hsl(var(--border-color))", marginBottom: "24px" }}>
                    <div style={{ fontSize: "0.8rem", marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}><Database size={15} style={{ color: "hsl(var(--primary))" }} /> <strong>数据库驱动:</strong> <code style={{ color: "hsl(var(--primary))" }}>rusqlite + bundled SQLite v3</code></div>
                    <div style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}><Info size={15} style={{ color: "hsl(var(--secondary))" }} /> <strong>存储位置:</strong> <code style={{ wordBreak: "break-all" }}>~/.config/omnigate/omnigate.db</code></div>
                  </div>

                  <button className="btn-secondary" style={{ color: "hsl(var(--danger))", borderColor: "hsl(var(--danger) / 0.2)" }} onClick={() => {
                    if (confirm("确定要清空本地所有供应商配置与统计数据吗？该操作不可撤销。")) {
                      alert("所有本地数据已安全清理并重置！");
                    }
                  }}><Trash2 size={15} /> 清除所有数据并重置</button>
                </div>
              )}

              {settingsSubTab === "client" && (
                <div className="panel-card">
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "20px" }}>全局网络与并发设置</h3>
                  
                  <div className="slider-group">
                    <div className="slider-header">
                      <span>单次请求超时限制 (Timeout)</span>
                      <span className="slider-value">{globalSettings.global_timeout} 秒</span>
                    </div>
                    <div className="slider-control-row">
                      <input type="range" min="10" max="300" step="10" value={globalSettings.global_timeout} onChange={(e) => setGlobalSettings(prev => ({ ...prev, global_timeout: Number(e.target.value) }))} />
                    </div>
                    <div className="slider-ticks">
                      <span>10s</span>
                      <span>60s</span>
                      <span>120s</span>
                      <span>300s</span>
                    </div>
                  </div>

                  <div className="slider-group">
                    <div className="slider-header">
                      <span>最大失败重试上限 (Max Retries)</span>
                      <span className="slider-value">{globalSettings.global_retry} 次</span>
                    </div>
                    <div className="slider-control-row">
                      <input type="range" min="0" max="5" step="1" value={globalSettings.global_retry} onChange={(e) => setGlobalSettings(prev => ({ ...prev, global_retry: Number(e.target.value) }))} />
                    </div>
                    <div className="slider-ticks">
                      <span>0次</span>
                      <span>1次</span>
                      <span>2次</span>
                      <span>3次</span>
                      <span>5次</span>
                    </div>
                  </div>

                  <div className="slider-group">
                    <div className="slider-header">
                      <span>最大并发限制上限 (Concurrency Limit)</span>
                      <span className="slider-value">{globalSettings.global_concurrency} 并发数</span>
                    </div>
                    <div className="slider-control-row">
                      <input type="range" min="1" max="50" step="1" value={globalSettings.global_concurrency} onChange={(e) => setGlobalSettings(prev => ({ ...prev, global_concurrency: Number(e.target.value) }))} />
                    </div>
                    <div className="slider-ticks">
                      <span>1个</span>
                      <span>5个</span>
                      <span>10个</span>
                      <span>20个</span>
                      <span>50个</span>
                    </div>
                  </div>
                </div>
              )}

              {settingsSubTab === "about" && (
                <div className="panel-card" style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div className="logo-icon" style={{ margin: "0 auto 20px auto", width: "64px", height: "64px", fontSize: "2rem" }}>Ω</div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "1.6rem" }}>OmniGate Rotator</h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.86rem", marginTop: "4px" }}>跨协议多账户 AI 负载轮换调度管理器</p>
                  
                  <div style={{ margin: "24px 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    <p>内核版本: Rust Core v0.1.0-alpha</p>
                    <p>UI 架构: React 18 + TS + Lucide Icons</p>
                  </div>
                  
                  <p style={{ fontSize: "0.78rem", color: "hsl(var(--primary))", fontWeight: "600" }}>© 2026 OmniGate DeepMind Pair Programming.</p>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* ============================================================================
          MODAL: ADD PROVIDER (添加供应商四步向导)
         ============================================================================ */}
      {/* ============================================================================
          MODAL: 供应商详情与模型管理
         ============================================================================ */}
      {showProviderDetailsModal && selectedProviderForDetails && (
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
                    {selectedProviderForDetails.name}
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
              
              {/* ---- 上半：基本信息 ---- */}
              <div style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px" }}>
                <h4 style={{ fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: "600", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Info size={12} /> 基本信息
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div className="form-group">
                    <label>供应商名称</label>
                    <input 
                      value={selectedProviderForDetails.name} 
                      onChange={(e) => {
                        const v = e.target.value;
                        setProviders(prev => prev.map(p => p.id === selectedProviderForDetails.id ? { ...p, name: v } : p));
                        setSelectedProviderForDetails(prev => prev ? { ...prev, name: v } : null);
                      }} 
                    />
                  </div>
                  <div className="form-group">
                    <label>协议类型</label>
                    <CustomSelect 
                      value={selectedProviderForDetails.protocol} 
                      onChange={(v) => {
                        setProviders(prev => prev.map(p => p.id === selectedProviderForDetails.id ? { ...p, protocol: v } : p));
                        setSelectedProviderForDetails(prev => prev ? { ...prev, protocol: v } : null);
                      }}
                      options={[
                        { value: "claude", label: "Claude 协议" },
                        { value: "codex_responses", label: "Codex /responses 协议" },
                        { value: "codex_chat", label: "Codex /chat 协议" }
                      ]}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <label>API 基础地址</label>
                    <input 
                      value={selectedProviderForDetails.api_url} 
                      onChange={(e) => {
                        const v = e.target.value;
                        setProviders(prev => prev.map(p => p.id === selectedProviderForDetails.id ? { ...p, api_url: v } : p));
                        setSelectedProviderForDetails(prev => prev ? { ...prev, api_url: v } : null);
                      }} 
                      style={{ marginBottom: "4px" }}
                    />
                    {selectedProviderForDetails.api_url.trim() && (() => {
                      const { discover, forward } = getUrlPreview(selectedProviderForDetails.api_url, selectedProviderForDetails.protocol);
                      return (
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "4px", marginTop: "2px", lineHeight: "1.4" }}>
                          <div><span style={{ opacity: 0.6 }}>发现端点：</span><code style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>{discover}</code></div>
                          <div><span style={{ opacity: 0.6 }}>对话转发：</span><code style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>{forward}</code></div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* ---- 下半：模型管理 (详情界面) ---- */}
              {(() => {
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
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {showAddProviderModal && (
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
      )}

      {/* ============================================================================
          MODAL: 拉取上游模型弹窗 (如图一)
         ============================================================================ */}
      {showPullModal && selectedProviderForDetails && (() => {
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
      )})()}
    </div>
  );
}

export default App;
