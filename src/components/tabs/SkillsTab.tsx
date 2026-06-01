
import { Plus, Check } from "lucide-react";
import { CustomSelect, Skill } from "../../App";

interface SkillsTabProps {
  newSkillName: string;
  setNewSkillName: (name: string) => void;
  newSkillDesc: string;
  setNewSkillDesc: (desc: string) => void;
  newSkillPrompt: string;
  setNewSkillPrompt: (prompt: string) => void;
  handleAddSkill: () => void;
  skills: Skill[];
  setEditingSkillId: (id: string) => void;
  handleToggleSkill: (id: string) => void;
  editingSkillId: string;
  handleSaveSkillPrompt: () => void;
  skillEditorContent: string;
  setSkillEditorContent: (content: string) => void;
}

export function SkillsTab({
  newSkillName,
  setNewSkillName,
  newSkillDesc,
  setNewSkillDesc,
  newSkillPrompt,
  setNewSkillPrompt,
  handleAddSkill,
  skills,
  setEditingSkillId,
  handleToggleSkill,
  editingSkillId,
  handleSaveSkillPrompt,
  skillEditorContent,
  setSkillEditorContent
}: SkillsTabProps) {
  return (
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
  );
}
