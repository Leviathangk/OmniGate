import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Terminal, AlertTriangle, Box, Package } from 'lucide-react';
import './McpDisplay.css';

interface McpServerDto {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  is_active: boolean;
}

export function McpDisplay() {
  const [activeTab, setActiveTab] = useState<'claude' | 'opencode' | 'codex'>('claude');
  const [servers, setServers] = useState<McpServerDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServers(activeTab);
  }, [activeTab]);

  const fetchServers = async (clientId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data: McpServerDto[] = await invoke('get_external_mcp_servers', { clientId });
      setServers(data);
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mcp-display-container">
      <div className="tabs-control-row">
        <button 
          className={`tab-select-btn ${activeTab === 'claude' ? 'active' : ''}`} 
          onClick={() => setActiveTab('claude')}
        >
          Claude Code
        </button>
        <button 
          className={`tab-select-btn ${activeTab === 'codex' ? 'active' : ''}`} 
          onClick={() => setActiveTab('codex')}
        >
          Codex CLI
        </button>
        <button 
          className={`tab-select-btn ${activeTab === 'opencode' ? 'active' : ''}`} 
          onClick={() => setActiveTab('opencode')}
        >
          OpenCode CLI
        </button>
      </div>

      <div className="mcp-content-area">
        {loading ? (
          <div className="mcp-loading-state">
            <div className="loading-spinner"></div>
            <span>正在读取 {activeTab} 配置...</span>
          </div>
        ) : error ? (
          <div className="mcp-error-state">
            <AlertTriangle size={24} className="error-icon" />
            <p>无法读取配置，请确保客户端已安装且配置文件存在。</p>
            <span className="error-details">{error}</span>
          </div>
        ) : servers.length === 0 ? (
          <div className="mcp-empty-state">
            <Box size={40} className="empty-icon" />
            <p>在 {activeTab} 中没有找到任何 MCP 服务</p>
          </div>
        ) : (
          <div className="mcp-grid">
            {servers.map(server => (
              <div key={server.id} className="mcp-card">
                <div className="mcp-card-header">
                  <div className="mcp-title">
                    <Package size={18} className="mcp-icon" />
                    <h4>{server.name}</h4>
                  </div>
                  <div className={`status-badge ${server.is_active ? 'active' : 'inactive'}`}>
                    {server.is_active ? '已启用' : '已禁用'}
                  </div>
                </div>
                
                <div className="mcp-card-body">
                  <div className="command-block">
                    <Terminal size={14} className="cmd-icon" />
                    <code>
                      {server.command} {server.args.join(' ')}
                    </code>
                  </div>
                  
                  {Object.keys(server.env).length > 0 && (
                    <div className="env-block">
                      <span className="env-label">环境变量:</span>
                      <div className="env-tags">
                        {Object.entries(server.env).map(([k, v]) => (
                          <span key={k} className="env-tag" title={`${k}=${v}`}>
                            {k}=...
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
