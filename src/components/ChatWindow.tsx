import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Send, Paperclip, X, Trash2, Plus, History, Sparkles, Brain, Zap, RotateCw, Loader2 } from 'lucide-react';
import { MessageRenderer, ToolCallRenderer } from './MessageRenderer';
import { db, ChatSession } from '@/db';
import { processFile } from '@/lib/fileProcessor';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDialog } from '@/components/ui/DialogProvider';
import { useChatSession } from '@/hooks/useChatSession';

/**
 * 聊天窗口组件属性
 * @property {string | null} [sessionId] - 当前对话会话 ID
 * @property {(sessionId: string | null) => void} [onSessionChange] - 会话变更时的回调函数
 * @property {string} [className] - 额外的 CSS 类名
 * @property {string} [placeholder] - 输入框提示文字
 */
interface ChatWindowProps {
  sessionId?: string | null;
  onSessionChange?: (sessionId: string | null) => void;
  className?: string;
  placeholder?: string;
}

/**
 * 聊天窗口对外暴露的引用接口
 * @property {() => void} reset - 重置聊天状态的方法
 */
export interface ChatWindowRef {
  reset: () => void;
}

/**
 * AI 聊天窗口组件
 * 提供消息流式渲染、文件上传、历史记录切换以及模式切换（快速执行/深度规划）功能。
 */
export const ChatWindow = forwardRef<ChatWindowRef, ChatWindowProps>(({
  sessionId,
  onSessionChange,
  className,
  placeholder
}, ref) => {
  const { showConfirm, showAlert } = useDialog();
  
  // --- 状态管理 ---
  /** 用户当前输入的文本内容 */
  const [input, setInput] = useState('');
  /** 已选择待上传的文件列表，包含处理后的文本内容和图片 */
  const [selectedFiles, setSelectedFiles] = useState<{ name: string, content: string, images?: string[] }[]>([]);
  /** 消息列表滚动容器引用，用于实现自动滚动 */
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** 文件选择输入框引用 */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 是否显示历史会话面板 */
  const [showHistory, setShowHistory] = useState(false);
  /**
   * Agent 运行模式
   * 'act': 快速执行模式，直接响应
   * 'plan': 深度规划模式，先思考后执行
   */
  const [mode, setMode] = useState<'act' | 'plan'>('act');
  
  /**
   * 使用自定义 Hook 管理聊天会话
   * 包含消息列表、加载状态、流式渲染状态文字以及发送消息等核心逻辑
   */
  const { messages, loading, status, currentSessionId, sendMessage, clearSession, retry } = useChatSession(sessionId || null, mode);

  /**
   * 实时查询所有历史会话
   * 使用 useLiveQuery 确保数据库更新时 UI 同步刷新
   */
  const history = useLiveQuery<ChatSession[]>(
    () => db.chatSessions.reverse().sortBy('updatedAt')
  );

  /** 暴露给父组件的实例方法 */
  useImperativeHandle(ref, () => ({
    reset: () => {
      clearSession();
      setInput('');
    }
  }));

  /**
   * 将消息列表滚动至底部
   * 确保用户始终能看到最新的消息内容
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  /**
   * 核心滚动逻辑：当消息列表更新（如流式渲染中新字符产生）时，自动触发滚动
   */
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * 处理文件选择事件
   * 调用 processFile 提取文件内容（如 PDF 文本、图片等）并加入待发送列表
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
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
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /**
   * 开启新对话
   * 清除当前会话状态并重置 UI
   */
  const handleNewChat = () => {
    clearSession();
    setShowHistory(false);
    if (onSessionChange) onSessionChange(null);
  };

  /**
   * 切换至指定历史会话
   * @param {string} id - 会话 ID
   */
  const switchSession = (id: string) => {
    if (onSessionChange) onSessionChange(id);
    setShowHistory(false);
  };

  /**
   * 删除历史会话
   * 级联删除会话及其所有关联的消息记录
   * @param {React.MouseEvent} e - 事件对象，阻止冒泡
   * @param {string} id - 会话 ID
   */
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

  /**
   * 发送消息处理函数
   * 负责收集输入文本、附件，调用 sendMessage 发送至 AI，并处理会话 ID 的自动更新
   */
  const handleSend = async () => {
    if ((!input.trim() && selectedFiles.length === 0)) return;

    const content = input;
    const files = selectedFiles;
    
    setInput('');
    setSelectedFiles([]);
    
    const newSessionId = await sendMessage(content, files);
    if (newSessionId && newSessionId !== currentSessionId && onSessionChange) {
      onSessionChange(newSessionId);
    }
  };

  return (
    <div className={`flex flex-col h-full relative ${className || ''}`}>
      {/* Header Controls */}
      <div className="absolute top-2 left-4 right-4 z-20 flex justify-between items-center pointer-events-none">
        <div className="flex bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md rounded-full p-1 shadow-sm border dark:border-zinc-700 pointer-events-auto">
          <button
            onClick={() => setMode('act')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${mode === 'act' ? 'bg-primary text-primary-foreground shadow' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            <Zap size={14} /> 快速执行
          </button>
          <button
            onClick={() => setMode('plan')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${mode === 'plan' ? 'bg-indigo-500 text-white shadow' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            <Brain size={14} /> 深度规划
          </button>
        </div>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="p-2 bg-white dark:bg-zinc-800 rounded-full shadow-md text-zinc-500 hover:text-blue-600 border dark:border-zinc-700 pointer-events-auto"
          title="历史对话"
        >
          <History size={18} />
        </button>
      </div>

      {/* History Overlay */}
      {showHistory && (
        <div className="absolute inset-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl z-30 flex flex-col p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-4 pt-10">
            <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-100">全局任务历史</h3>
            <button onClick={() => setShowHistory(false)} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"><X size={18} /></button>
          </div>
          <button
            onClick={handleNewChat}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground p-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm mb-4 font-medium"
          >
            <Plus size={18} /> 新建任务会话
          </button>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {history?.map(s => (
              <div
                key={s.id}
                onClick={() => switchSession(s.id)}
                className={`w-full text-left p-3.5 rounded-xl border dark:border-zinc-800 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 cursor-pointer group transition-all duration-200 ${currentSessionId === s.id ? 'border-primary/50 bg-primary/5 shadow-sm' : 'bg-white dark:bg-zinc-900'
                  }`}
              >
                <div className={`p-2 rounded-lg ${s.mode === 'plan' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                   {s.mode === 'plan' ? <Brain size={16} /> : <Zap size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {s.title}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                    <span>{new Date(s.updatedAt).toLocaleString()}</span>
                    <span className="capitalize px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-[10px]">{s.mode || 'act'}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => deleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-zinc-400 hover:text-destructive hover:bg-destructive/10 rounded-full transition-all"
                  title="删除对话"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {history?.length === 0 && <div className="text-center text-zinc-500 mt-10">暂无任务记录</div>}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6 pt-16 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-inner ${mode === 'plan' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500' : 'bg-zinc-50 dark:bg-zinc-800/50 text-primary'}`}>
              {mode === 'plan' ? <Brain size={32} /> : <Sparkles size={32} />}
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {mode === 'plan' ? "深度规划模式已开启" : "快速执行模式已开启"}
              </p>
              <p className="text-xs text-zinc-400 max-w-[250px]">
                {mode === 'plan' ? "Agent 将先进行思考规划，再逐步执行复杂任务。" : "Agent 将直接响应请求，快速执行操作。"}
              </p>
            </div>
          </div>
        )}
        {messages.filter(m => m.role !== 'tool').map((m, i) => {
          const toolResults: Record<string, string> = {};
          if (m.role === 'assistant' && m.tool_calls) {
            const startIdx = messages.indexOf(m);
            for (let j = startIdx + 1; j < messages.length; j++) {
              const nextMsg = messages[j];
              if (nextMsg.role === 'tool' && nextMsg.tool_call_id) {
                toolResults[nextMsg.tool_call_id] = nextMsg.content as string;
              } else if (nextMsg.role === 'assistant' || nextMsg.role === 'user') {
                break;
              }
            }
          }

          return (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              {m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0 ? (
                <div className="flex flex-col gap-2 max-w-[90%] md:max-w-[80%]">
                  <ToolCallRenderer toolCalls={m.tool_calls} results={toolResults} />
                  {m.content && (
                    <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm shadow-sm rounded-2xl rounded-tl-sm ring-1 ring-zinc-900/5 dark:ring-zinc-100/10 p-4">
                      <MessageRenderer content={m.content as any} isUser={false} />
                    </div>
                  )}
                </div>
              ) : (
                <div className={`max-w-[90%] md:max-w-[80%] p-4 relative group ${m.role === 'user'
                  ? 'bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 rounded-2xl rounded-tr-sm shadow-md'
                  : 'bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm shadow-sm rounded-2xl rounded-tl-sm ring-1 ring-zinc-900/5 dark:ring-zinc-100/10'
                  }`}>
                  <MessageRenderer content={m.content as any} isUser={m.role === 'user'} />
                  
                  {m.role === 'user' && !loading && (
                    <button
                      onClick={() => retry(i)}
                      className="absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-primary opacity-0 group-hover:opacity-100 transition-all bg-white dark:bg-zinc-800 rounded-full shadow-sm border dark:border-zinc-700"
                      title="从此消息重试"
                    >
                      <RotateCw size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {loading && messages.length > 0 && messages[messages.length - 1].role !== 'assistant' && (
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

      <div className="p-4 bg-transparent pt-0">
        {loading && status && (
          <div className="flex items-center gap-2 px-4 py-2 mb-2 text-xs font-medium text-zinc-500 animate-in fade-in slide-in-from-bottom-1 duration-300 bg-white/50 dark:bg-zinc-800/50 backdrop-blur-sm rounded-full w-fit mx-auto border dark:border-zinc-700 shadow-sm">
            <Loader2 size={12} className="animate-spin text-primary" />
            <span>{status}</span>
          </div>
        )}
        <div className="flex gap-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-2 rounded-[1.5rem] shadow-lg border border-zinc-200/50 dark:border-zinc-800/50 ring-1 ring-black/5 dark:ring-white/5 items-end transition-all focus-within:ring-primary/20 focus-within:border-primary/30">
          <button onClick={() => fileInputRef.current?.click()} className="p-3 text-zinc-400 hover:text-primary hover:bg-primary/10 rounded-full transition-all duration-300 mb-0.5" title="上传文件">
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
            className="flex-1 bg-transparent px-2 py-3.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none placeholder:text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed resize-none max-h-[150px] min-h-[48px]"
            value={input}
            placeholder={placeholder || "告诉 Agent 你想做什么..."}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
                const target = e.target as HTMLTextAreaElement;
                setTimeout(() => {
                  target.style.height = 'auto';
                }, 0);
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && selectedFiles.length === 0) || loading}
            className={`p-3 rounded-full transition-all duration-300 mb-0.5 shadow-sm ${(!input.trim() && selectedFiles.length === 0) || loading
              ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95'
              }`}
          >
            <Send size={18} className={loading ? 'animate-pulse' : ''} />
          </button>
        </div>
      </div>
    </div>
  );
});
