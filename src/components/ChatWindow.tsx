import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { streamAICompletion, Message, MessageContentPart } from '@/services/ai';
import { Send, Paperclip, X, Trash2, Plus, History, MessageSquare, Folder } from 'lucide-react';
import { MessageRenderer } from './MessageRenderer';
import { db, ChatSession } from '@/db';
import { processFile } from '@/lib/fileProcessor';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDialog } from '@/components/ui/DialogProvider';
import { Modal } from '@/components/ui/Modal';

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
  const [showResources, setShowResources] = useState(false);

  // Fetch history if entityId is provided, otherwise fetch general sessions
  const history = useLiveQuery<ChatSession[]>(
    () => entityId 
      ? db.chatSessions.where('entityId').equals(entityId).reverse().sortBy('updatedAt')
      : db.chatSessions.filter(s => !s.entityId).reverse().sortBy('updatedAt'),
    [entityId]
  );

  // Fetch available resources
  const availableResources = useLiveQuery(() =>
    db.entities.where({ type: 'file', subjectId: 'resource_library' }).toArray()
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

  const handleResourceSelect = (resource: any) => {
    setSelectedFiles(prev => [
      ...prev,
      {
        name: resource.title,
        content: resource.content.textContent || "(Empty File)",
        // images: ... (if we store image refs later)
      }
    ]);
    setShowResources(false);
  };

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
                const parsed = JSON.parse(potentialJson);
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
              const parsed = JSON.parse(assistantContent.substring(firstOpen, lastClose + 1));
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
                const parsed = JSON.parse(assistantContent.substring(firstOpenObj, lastCloseObj + 1));
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
            className="p-2 bg-white dark:bg-slate-800 rounded-full shadow-md text-slate-500 hover:text-blue-600 border dark:border-slate-700"
            title="历史对话"
          >
            <History size={18} />
          </button>
      </div>

      {/* History Overlay */}
      {showHistory && (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-30 flex flex-col p-4 animate-in fade-in duration-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">历史对话</h3>
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
                className={`w-full text-left p-3 rounded border dark:border-slate-700 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer group ${currentSessionId === s.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
              >
                <MessageSquare size={16} className="text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                    {s.title}
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-all"
                  title="删除对话"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {history?.length === 0 && <div className="text-center text-slate-500 mt-10">暂无历史记录</div>}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 pt-10">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-10">
            {placeholder || "开始与 AI 对话..."}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] md:max-w-[80%] rounded-lg p-3 ${m.role === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-slate-800 border dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-sm'
              }`}>
              <MessageRenderer content={m.content} />
            </div>
          </div>
        ))}
        {loading && !messages[messages.length - 1]?.content && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border dark:border-slate-700 text-slate-500">
              思考中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {selectedFiles.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
          {selectedFiles.map((f, i) => (
            <div key={i} className="relative bg-slate-100 dark:bg-slate-800 p-2 rounded border dark:border-slate-700 flex items-center gap-2 max-w-[200px]">
              <div className="truncate text-xs text-slate-700 dark:text-slate-300">{f.name}</div>
              <button onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 border-t dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowResources(true)}
            className="p-2 text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors"
            title="从资料库引用"
          >
            <Folder size={20} />
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors" title="上传文件 (图片, Word, Excel, 文本)">
            <Paperclip size={20} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={handleFileSelect}
          />
          <input
            className="flex-1 border rounded-lg px-4 py-2 bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="输入问题..."
            disabled={loading || !settings?.apiKey}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !settings?.apiKey}
            className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Send size={20} />
          </button>
        </div>
        {!settings?.apiKey && <div className="text-red-500 text-sm mt-2">请先在设置中配置 API Key。</div>}
      </div>

      {/* Resource Selection Modal */}
      <Modal
        isOpen={showResources}
        onClose={() => setShowResources(false)}
        title="选择资料库文件"
      >
        <div className="space-y-2">
          {!availableResources || availableResources.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              暂无资料，请先在侧边栏“资料库”中上传。
            </div>
          ) : (
            availableResources.map(file => (
              <button
                key={file.id}
                onClick={() => handleResourceSelect(file)}
                className="w-full text-left p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 transition-colors border dark:border-slate-800"
              >
                <Folder className="text-blue-500" size={20} />
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{file.title}</div>
                  <div className="text-xs text-slate-500">{(file.content.size / 1024).toFixed(1)} KB • {new Date(file.createdAt).toLocaleDateString()}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
});

ChatWindow.displayName = 'ChatWindow';
