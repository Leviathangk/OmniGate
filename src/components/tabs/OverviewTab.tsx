import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Server, Cpu, Activity, Hash } from "lucide-react";


// 也可以将接口复制过来，为了零逻辑修改，可以从 App.tsx 导出这些类型，或者在组件内部引用。
// 由于我们要零侵入，最好在 App.tsx 前面加 export 关键字。

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

interface OverviewTabProps {
  overviewData: any;
  trafficTrend: any[];
  recentActivities: any[];
  modelUsage: any[];
  statsPeriod: number;
  setStatsPeriod: (n: number) => void;
  heatmapData: any[];
}

export function OverviewTab({
  overviewData,
  trafficTrend,
  recentActivities,
  modelUsage,
  statsPeriod,
  setStatsPeriod,
  heatmapData
}: OverviewTabProps) {
  return (
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
          <div className="stat-icon-container"><Activity size={20} /></div>
          <div className="stat-info">
            <p>今日请求总数</p>
            <h3>{overviewData.today_requests} 次</h3>
            <div className="stat-sub">较昨日: <strong>{overviewData.today_requests_growth}</strong></div>
          </div>
        </div>
        <div className="stat-card orange">
          <div className="stat-icon-container"><Hash size={20} /></div>
          <div className="stat-info">
            <p>今日消耗 Tokens</p>
            <h3>{overviewData.today_tokens}</h3>
            <div className="stat-sub">较昨日: <strong>{overviewData.today_tokens_growth}</strong></div>
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
                      {modelUsage.map((_entry: any, index: number) => {
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
            <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>请求趋势</h3>
              <div style={{ display: 'flex', background: 'hsl(var(--border-card))', padding: '3px', borderRadius: '8px', border: '1px solid hsl(var(--border-color))' }}>
                {[7, 15, 30].map(days => (
                  <button
                    key={days}
                    onClick={() => setStatsPeriod(days)}
                    style={{
                      background: statsPeriod === days ? 'hsl(var(--bg-card))' : 'transparent',
                      color: statsPeriod === days ? 'hsl(var(--text-primary))' : 'hsl(var(--text-muted))',
                      border: 'none',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: statsPeriod === days ? '600' : 'normal',
                      transition: 'all 0.2s ease',
                      boxShadow: statsPeriod === days ? 'var(--card-shadow)' : 'none'
                    }}
                  >
                    近 {days} 天
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: '20px', height: '220px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={Array.from({ length: statsPeriod }).map((_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - (statsPeriod - 1) + i);
                    const dateStr = d.toISOString().split('T')[0];
                    const found = heatmapData.find(item => item.date === dateStr);
                    return { date: dateStr.slice(5), count: found ? found.count : 0 };
                  })}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="hsl(var(--text-muted))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--text-muted))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border-color))', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: 'hsl(var(--text-primary))' }}
                    labelStyle={{ color: 'hsl(var(--text-secondary))', marginBottom: '4px' }}
                    cursor={{ stroke: 'hsl(var(--border-color))', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area type="monotone" dataKey="count" name="请求次数" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" activeDot={{ r: 6, fill: 'hsl(var(--primary))', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
