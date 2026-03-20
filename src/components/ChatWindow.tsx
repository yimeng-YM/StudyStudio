import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { streamAICompletion, Message, MessageContentPart } from '@/services/ai';
import { Send, Paperclip, X, Trash2, Plus, History, MessageSquare, Sparkles } from 'lucide-react';
import { MessageRenderer } from './MessageRenderer';
import { db, ChatSession } from '@/db';
import { processFile } from '@/lib/fileProcessor';
import { parseAIJson } from '@/lib/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDialog } from '@/components/ui/DialogProvider';

interface ChatWindowProps {
  sessionId?: string | null;
  entityId?: string; // Associated entity ID for multi-session support
  sourceType?: 'general' | 'mindmap' | 'note' | 'task';
  onSessionChange?: (sessionId: string) => void;
  systemContext?: string | (() => string); // Additional context for AI (e.g. MindMap structure)
  className?: string;
  placeholder?: string;
  onAICommand?: (command: any) => void;
}

export interface ChatWindowRef {
  reset: () => void;
}

export const ChatWindow = forwardRef<ChatWindowRef, ChatWindowProps>(({
  sessionId,
  entityId,
  sourceType,
  onSessionChange,
  systemContext,
  className,
  placeholder,
  onAICommand
}, ref) => {
  const { settings } = useAIStore();
  const { showConfirm, showAlert } = useDialog();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<{ name: string, content: string, images?: string[] }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch history if entityId is provided, otherwise fetch general sessions
  const history = useLiveQuery<ChatSession[]>(
    () => entityId
      ? db.chatSessions.where('entityId').equals(entityId).reverse().sortBy('updatedAt')
      : db.chatSessions.filter(s => !s.entityId).reverse().sortBy('updatedAt'),
    [entityId]
  );

  // Sync prop sessionId to internal state
  useEffect(() => {
    if (sessionId !== undefined) {
      setCurrentSessionId(sessionId);
    }
  }, [sessionId]);

  // Load messages when sessionId changes
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      const msgs = await db.chatMessages
        .where('sessionId')
        .equals(currentSessionId)
        .sortBy('createdAt');

      setMessages(msgs.map(m => ({
        role: m.role,
        content: m.content
      } as Message)));
    };

    loadMessages();
  }, [currentSessionId]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      setMessages([]);
      setInput('');
      setCurrentSessionId(null);
    }
  }));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setLoading(true); // Temporary loading state while processing
      try {
        const newFiles: { name: string, content: string, images?: string[] }[] = [];
        for (let i = 0; i < files.length; i++) {
          const processed = await processFile(files[i]);
          newFiles.push({
            name: files[i].name,
            content: processed.text,
            images: processed.images
          });
        }
        setSelectedFiles(prev => [...prev, ...newFiles]);
      } catch (e) {
        console.error(e);
        showAlert('文件处理失败');
      } finally {
        setLoading(false);
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const createSessionIfNeeded = async (): Promise<string> => {
    if (currentSessionId) return currentSessionId;

    const newSessionId = crypto.randomUUID();
    const title = input.slice(0, 30) || 'New Chat';

    await db.chatSessions.add({
      id: newSessionId,
      title,
      entityId,
      sourceType,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    setCurrentSessionId(newSessionId);
    if (onSessionChange) onSessionChange(newSessionId);
    return newSessionId;
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setShowHistory(false);
    if (onSessionChange && currentSessionId) {
      // Signal parent we are clearing (optional, depends on parent logic)
      // Actually, we just wait for next message to create new session
    }
  };

  const switchSession = (id: string) => {
    setCurrentSessionId(id);
    if (onSessionChange) onSessionChange(id);
    setShowHistory(false);
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    const confirmed = await showConfirm('确定要删除此对话吗？', { title: '删除对话' });
    if (!confirmed) return;

    await db.chatMessages.where('sessionId').equals(id).delete();
    await db.chatSessions.delete(id);

    if (currentSessionId === id) {
      handleNewChat();
    }
  };

  const saveMessage = async (sessId: string, role: 'user' | 'assistant', content: string | MessageContentPart[]) => {
    await db.chatMessages.add({
      id: crypto.randomUUID(),
      sessionId: sessId,
      role,
      content,
      createdAt: Date.now()
    });

    // Update session timestamp
    await db.chatSessions.update(sessId, { updatedAt: Date.now() });
  };

  const sendMessage = async () => {
    if ((!input.trim() && selectedFiles.length === 0) || !settings) return;

    try {
      let content: string | MessageContentPart[] = input;

      if (selectedFiles.length > 0) {
        const parts: MessageContentPart[] = [];
        if (input.trim()) parts.push({ type: 'text', text: input });

        selectedFiles.forEach(f => {
          parts.push({ type: 'text', text: f.content });
          if (f.images) {
            f.images.forEach(img => {
              parts.push({ type: 'image_url', image_url: { url: img } });
            });
          }
        });
        content = parts;
      }

      const sessId = await createSessionIfNeeded();

      const contextMessages: Message[] = [];
      const contextContent = typeof systemContext === 'function' ? systemContext() : systemContext;
      if (contextContent) {
        contextMessages.push({ role: 'system', content: contextContent });
      }

      const newMessage: Message = { role: 'user', content };
      const allMessages = [...messages, newMessage]; // For UI

      const apiMessages = [...contextMessages, ...allMessages];

      // Update UI immediately
      setMessages(allMessages);
      setInput('');
      setSelectedFiles([]);
      setLoading(true);

      // Save user message
      await saveMessage(sessId, 'user', content);

      let assistantContent = '';

      // Add a placeholder for assistant response
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      await streamAICompletion(apiMessages, settings, (chunk) => {
        assistantContent += chunk;
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg.role === 'assistant') {
            lastMsg.content = assistantContent;
          }
          return newMsgs;
        });
      });

      // Check for commands in the response
      if (onAICommand) {
        let found = false;

        // Robust JSON extraction from Markdown code blocks to handle nested backticks (e.g. mermaid in JSON string)
        const markers = [...assistantContent.matchAll(/```(?:json)?/g)];
        if (markers.length > 0) {
          for (const startMatch of markers) {
            const contentStart = startMatch.index! + startMatch[0].length;

            // Try every subsequent "```" as a potential end marker
            const endMarkerRegex = /```/g;
            endMarkerRegex.lastIndex = contentStart;
            let endMatch;

            while ((endMatch = endMarkerRegex.exec(assistantContent)) !== null) {
              const potentialJson = assistantContent.substring(contentStart, endMatch.index).trim();
              if (!potentialJson) continue;

              try {
                const parsed = parseAIJson(potentialJson);
                // Validate if it looks like a command
                if (Array.isArray(parsed) || (parsed.action && typeof parsed.action === 'string')) {
                  found = true;
                  if (Array.isArray(parsed)) {
                    parsed.forEach(cmd => onAICommand(cmd));
                  } else {
                    onAICommand(parsed);
                  }
                  break; // Found a valid JSON block starting here
                }
              } catch (e) {
                // Continue searching for a later closing backtick
              }
            }
            if (found) break; // Stop after finding the first valid command block
          }
        }

        if (!found) {
          const firstOpen = assistantContent.indexOf('[');
          const lastClose = assistantContent.lastIndexOf(']');
          if (firstOpen !== -1 && lastClose > firstOpen) {
            try {
              const parsed = parseAIJson(assistantContent.substring(firstOpen, lastClose + 1));
              if (Array.isArray(parsed)) {
                parsed.forEach(cmd => onAICommand(cmd));
                found = true;
              }
            } catch (e) { /* ignore */ }
          }
          if (!found) {
            const firstOpenObj = assistantContent.indexOf('{');
            const lastCloseObj = assistantContent.lastIndexOf('}');
            if (firstOpenObj !== -1 && lastCloseObj > firstOpenObj) {
              try {
                const parsed = parseAIJson(assistantContent.substring(firstOpenObj, lastCloseObj + 1));
                onAICommand(parsed);
                found = true;
              } catch (e) { /* ignore */ }
            }
          }
        }
      }

      // Save assistant message after completion
      await saveMessage(sessId, 'assistant', assistantContent);

      const isFirstTurn = messages.length === 0;

      if (isFirstTurn && assistantContent.length > 10) {
        generateTitle(sessId, input, assistantContent);
      }

    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: " + e }]);
    } finally {
      setLoading(false);
    }
  };

  const generateTitle = async (sessId: string, userMsg: string, aiMsg: string) => {
    if (!settings) return;
    try {
      const namingModel = settings.namingModel || settings.model;
      const prompt = `根据下面的对话，生成一个非常简短的标题（5个字以内），不要包含引号或标点。\n\nUser: ${userMsg.slice(0, 200)}\nAI: ${aiMsg.slice(0, 200)}`;

      let title = '';
      await streamAICompletion(
        [{ role: 'user', content: prompt }],
        { ...settings, model: namingModel },
        (chunk) => title += chunk
      );

      title = title.trim().replace(/^["']|["']$/g, '');
      if (title) {
        await db.chatSessions.update(sessId, { title });
        // Force refresh if needed, usually liveQuery handles it in other components
      }
    } catch (e) {
      console.error("Auto naming failed", e);
    }
  };

  return (
    <div className={`flex flex-col h-full relative ${className || ''}`}>
      {/* Header for history toggle */}
      <div className="absolute top-2 right-4 z-20">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="p-2 bg-white dark:bg-zinc-800 rounded-full shadow-md text-zinc-500 hover:text-blue-600 border dark:border-zinc-700"
          title="历史对话"
        >
          <History size={18} />
        </button>
      </div>

      {/* History Overlay */}
      {showHistory && (
        <div className="absolute inset-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl z-30 flex flex-col p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-100">历史对话</h3>
            <button onClick={() => setShowHistory(false)}><X size={20} /></button>
          </div>
          <button
            onClick={handleNewChat}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 mb-4"
          >
            <Plus size={18} /> 新对话
          </button>
          <div className="flex-1 overflow-y-auto space-y-2">
            {history?.map(s => (
              <div
                key={s.id}
                onClick={() => switchSession(s.id)}
                className={`w-full text-left p-3 rounded-xl border dark:border-zinc-700 flex items-center gap-2 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 cursor-pointer group transition-all duration-200 ${currentSessionId === s.id ? 'border-primary/50 bg-primary/5' : 'border-transparent'
                  }`}
              >
                <MessageSquare size={16} className="text-zinc-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {s.title}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-zinc-400 hover:text-destructive hover:bg-destructive/10 rounded-full transition-all"
                  title="删除对话"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {history?.length === 0 && <div className="text-center text-zinc-500 mt-10">暂无历史记录</div>}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6 pt-10 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-4">
            <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <Sparkles size={32} className="text-primary/50" />
            </div>
            <p className="text-sm font-medium">{placeholder || "开始与 AI 对话..."}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[90%] md:max-w-[80%] p-4 ${m.role === 'user'
              ? 'bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 rounded-2xl rounded-tr-sm shadow-md'
              : 'bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm shadow-sm rounded-2xl rounded-tl-sm ring-1 ring-zinc-900/5 dark:ring-zinc-100/10'
              }`}>
              <MessageRenderer content={m.content} isUser={m.role === 'user'} />
            </div>
          </div>
        ))}
        {loading && !messages[messages.length - 1]?.content && (
          <div className="flex justify-start animate-in fade-in">
            <div className="bg-white/50 dark:bg-zinc-800/50 p-4 rounded-2xl rounded-tl-sm flex items-center gap-2 text-zinc-500">
              <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {selectedFiles.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
          {selectedFiles.map((f, i) => (
            <div key={i} className={`relative backdrop-blur px-3 py-1.5 rounded-lg border flex items-center gap-2 max-w-[200px] shadow-sm animate-in zoom-in duration-200 ${f.name.endsWith('.pdf') ? 'bg-red-50/80 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-white/80 dark:bg-zinc-800/80 border-primary/20'
              }`}>
              {f.name.endsWith('.pdf') ? (
                <div className="w-8 h-8 rounded bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-red-600 dark:text-red-400">PDF</span>
                </div>
              ) : (
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles size={14} className="text-primary" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">{f.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{f.content.length > 0 ? `${(f.content.length / 1024).toFixed(1)}KB` : 'Empty'}</div>
              </div>
              <button
                onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1 -right-1 bg-destructive/90 text-destructive-foreground rounded-full p-0.5 hover:scale-110 transition-transform shadow-sm"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 bg-transparent">
        <div className="flex gap-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-2 rounded-[1.5rem] shadow-lg border border-zinc-200/50 dark:border-zinc-800/50 ring-1 ring-black/5 dark:ring-white/5 items-end">
          <button onClick={() => fileInputRef.current?.click()} className="p-3 text-zinc-500 hover:text-primary hover:bg-primary/10 rounded-full transition-all duration-300 mb-0.5" title="上传文件">
            <Paperclip size={20} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={handleFileSelect}
          />
          <textarea
            className="flex-1 bg-transparent px-2 py-3 text-zinc-900 dark:text-zinc-100 focus:outline-none placeholder:text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed resize-none max-h-[120px] min-h-[44px]"
            value={input}
            onChange={e => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
                // Reset height after send
                const target = e.target as HTMLTextAreaElement;
                setTimeout(() => {
                  target.style.height = 'auto';
                }, 0);
              }
            }}
            placeholder={!settings?.apiKey ? "请先在设置中配置 API Key" : "输入问题..."}
            disabled={loading || !settings?.apiKey}
            rows={1}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !settings?.apiKey}
            className="bg-primary text-primary-foreground p-3 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 transition-all duration-300 mb-0.5"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
});

ChatWindow.displayName = 'ChatWindow';
