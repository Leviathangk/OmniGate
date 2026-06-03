import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Trash2, AlertCircle } from 'lucide-react';
import { Provider, Model, CustomSelect } from '../../App';
import { invoke } from '@tauri-apps/api/core';

interface ChatTestTabProps {
  providers: Provider[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatTestTab({ providers }: ChatTestTabProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [fetchedModels, setFetchedModels] = useState<Model[]>([]);
  
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeProviders = providers.filter(p => p.is_active);
  const availableModels = fetchedModels.filter(m => m.is_active);

  useEffect(() => {
    if (selectedProviderId) {
      invoke<Model[]>("get_models", { providerId: selectedProviderId })
        .then(mods => setFetchedModels(mods))
        .catch(err => console.error("Load models failed:", err));
    } else {
      setFetchedModels([]);
    }
  }, [selectedProviderId]);

  useEffect(() => {
    if (activeProviders.length > 0 && !selectedProviderId) {
      setSelectedProviderId(activeProviders[0].id);
    }
  }, [activeProviders, selectedProviderId]);

  useEffect(() => {
    if (availableModels.length > 0) {
      if (!availableModels.some(m => m.name === selectedModel)) {
        setSelectedModel(availableModels[0].name);
      }
    } else {
      setSelectedModel('');
    }
  }, [availableModels, selectedModel, selectedProviderId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedProviderId || !selectedModel || isLoading) return;

    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return;

    // 添加用户消息并实施滑动窗口策略 (保留最近 20 轮，即 40 条消息)
    const newUserMessage: Message = { role: 'user', content: inputText.trim() };
    const newHistory = [...chatHistory, newUserMessage].slice(-40);
    setChatHistory(newHistory);
    setInputText('');
    setIsLoading(true);
    setErrorMsg('');

    // 添加一个空的助手消息占位
    setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);

    const proxyPort = 3456;
    let endpoint = `http://127.0.0.1:${proxyPort}`;
    let payload: any = {};

    if (provider.protocol === 'claude') {
      endpoint += '/claude/v1/messages';
      payload = {
        model: selectedModel,
        max_tokens: 4096,
        messages: newHistory.map(m => ({ role: m.role, content: m.content })),
        stream: true
      };
    } else if (provider.protocol === 'codex_chat' || provider.protocol.includes('chat')) {
      endpoint += '/codex/v1/chat/completions';
      payload = {
        model: selectedModel,
        messages: newHistory.map(m => ({ role: m.role, content: m.content })),
        stream: true
      };
    } else if (provider.protocol === 'codex_responses' || provider.protocol.includes('responses')) {
      endpoint += '/codex/v1/completions';
      const prompt = newHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + '\nAssistant: ';
      payload = {
        model: selectedModel,
        prompt: prompt,
        max_tokens: 4096,
        stream: true
      };
    } else {
      endpoint += '/codex/v1/chat/completions';
      payload = {
        model: selectedModel,
        messages: newHistory.map(m => ({ role: m.role, content: m.content })),
        stream: true
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
          'x-api-key': 'test-token',
          'x-omnigate-test-provider': provider.id
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status} - ${errText}`);
      }

      if (!response.body) throw new Error('No response body stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let buffer = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep the last partial line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.substring(6).trim();
              if (dataStr === '[DONE]') continue;
              
              try {
                const data = JSON.parse(dataStr);
                let chunkText = '';
                
                // Parse based on protocol
                if (provider.protocol === 'claude') {
                  if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
                    chunkText = data.delta.text;
                  }
                } else if (provider.protocol === 'codex_responses' || provider.protocol.includes('responses')) {
                  if (data.choices && data.choices[0] && data.choices[0].text) {
                    chunkText = data.choices[0].text;
                  }
                } else {
                  // codex_chat
                  if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                    chunkText = data.choices[0].delta.content;
                  }
                }

                if (chunkText) {
                  setChatHistory(prev => {
                    const next = [...prev];
                    const lastMsg = { ...next[next.length - 1] };
                    lastMsg.content += chunkText;
                    next[next.length - 1] = lastMsg;
                    return next;
                  });
                }
              } catch (e) {
                console.warn('Failed to parse SSE data:', dataStr);
              }
            } else if (trimmed.startsWith('event: ')) {
               // Claude uses event: and data:
            }
          }
        }
      }
    } catch (error: any) {
      console.error("Test Request Failed:", error);
      setErrorMsg(error.message || "请求失败");
      // Remove the empty assistant placeholder if there's an error right away, or append error
      setChatHistory(prev => {
        const next = [...prev];
        if (next[next.length - 1].content === '') {
          next[next.length - 1].content = '请求发生异常：' + (error.message || "未知错误");
        }
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 144px)', gap: '16px' }}>
      <div className="panel-card" style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>测试供应商 (仅显示启用)</label>
            {selectedProviderId && (
              <span className="status-badge secondary" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                {activeProviders.find(p => p.id === selectedProviderId)?.protocol}
              </span>
            )}
          </div>
          <CustomSelect 
            value={selectedProviderId} 
            onChange={v => setSelectedProviderId(v as string)}
            options={[
              { value: "", label: "请选择供应商..." },
              ...activeProviders.map(p => ({ value: p.id, label: p.name }))
            ]}
          />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>选择可用模型 (仅显示启用)</label>
          <CustomSelect 
            value={selectedModel} 
            onChange={v => setSelectedModel(v as string)}
            options={[
              { value: "", label: availableModels.length > 0 ? "请选择模型..." : "无可用模型" },
              ...availableModels.map(m => ({ value: m.name, label: m.name }))
            ]}
          />
        </div>

        <div style={{ alignSelf: 'flex-end' }}>
          <button 
            className="btn-secondary" 
            onClick={() => setChatHistory([])}
            disabled={chatHistory.length === 0}
            style={{ height: '36px', padding: '0 16px' }}
            title="清空对话"
          >
            <Trash2 size={16} style={{ marginRight: '6px' }} />
            清空历史
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="github-alert danger" style={{ padding: "12px", borderRadius: "8px", backgroundColor: "hsl(var(--danger) / 0.1)", border: "1px solid hsl(var(--danger) / 0.3)" }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(var(--danger))' }}>
            <AlertCircle size={16} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>测试出错: {errorMsg}</span>
          </div>
        </div>
      )}

      <div className="panel-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {chatHistory.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: '12px' }}>
              <Bot size={48} opacity={0.2} />
              <p>选择供应商与模型后，输入消息即可开始测试连通性。</p>
            </div>
          ) : (
            chatHistory.map((msg, idx) => (
              <div key={idx} style={{ 
                display: 'flex', 
                gap: '12px',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start'
              }}>
                <div style={{ 
                  width: '32px', height: '32px', borderRadius: '50%', 
                  background: msg.role === 'user' ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {msg.role === 'user' ? <User size={16} color="white" /> : <Bot size={16} color="white" />}
                </div>
                <div style={{ 
                  backgroundColor: msg.role === 'user' ? 'hsl(var(--primary) / 0.2)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${msg.role === 'user' ? 'hsl(var(--primary) / 0.4)' : 'rgba(255,255,255,0.06)'}`,
                  padding: '12px 16px',
                  borderRadius: '12px',
                  maxWidth: '80%',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {msg.content || (isLoading && idx === chatHistory.length - 1 ? (
                    <div className="typing-dots"><span></span><span></span><span></span></div>
                  ) : null)}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '0 20px 24px 20px' }}>
          <div style={{ 
            position: 'relative', 
            backgroundColor: 'hsl(var(--bg-app))', 
            border: '1px solid hsl(var(--border-color))', 
            borderRadius: '32px', 
            display: 'flex',
            alignItems: 'flex-end',
            boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
          }}>
            <textarea 
              value={inputText}
              onChange={e => {
                setInputText(e.target.value);
                e.target.style.height = '64px';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 300)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="输入测试消息，Shift + Enter 换行，Enter 发送..."
              style={{ 
                flex: 1, 
                height: '64px', 
                minHeight: '64px', 
                maxHeight: '300px', 
                resize: 'none', 
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'hsl(var(--text-primary))',
                fontFamily: 'inherit',
                fontSize: '0.98rem',
                padding: '20px 24px',
                lineHeight: '1.5'
              }}
              disabled={isLoading || !selectedProviderId || !selectedModel}
            />
            <button 
              className="btn-primary" 
              style={{ 
                height: '48px', 
                width: '48px',
                borderRadius: '50%',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                margin: '8px',
                opacity: (!inputText.trim() || isLoading || !selectedProviderId || !selectedModel) ? 0.5 : 1,
                cursor: (!inputText.trim() || isLoading || !selectedProviderId || !selectedModel) ? 'not-allowed' : 'pointer'
              }}
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading || !selectedProviderId || !selectedModel}
              title="发送消息"
            >
              <Send size={18} style={{ marginLeft: '2px', marginRight: '2px' }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
