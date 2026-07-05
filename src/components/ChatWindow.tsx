import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Send, Paperclip, X, Trash2, Plus, History, Sparkles, Brain, Zap, Microscope, RotateCw, Loader2, Square } from 'lucide-react';
import { MessageRenderer, ToolCallRenderer, ThinkingBlock } from './MessageRenderer';
import { db, ChatSession } from '@/db';
import { processFile } from '@/lib/fileProcessor';
import { generateUUID } from '@/lib/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDialog } from '@/components/ui/DialogProvider';
import { useChatSession } from '@/hooks/useChatSession';
import { ModelSwitcher } from './ModelSwitcher';
import { ModeSwitcher } from './ModeSwitcher';
import { ToolConfigSwitcher } from './ToolConfigSwitcher';

/**
 * 格式化文件大小为易读字符串
 * @param bytes - 文件字节数
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

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
  /** 已选择待上传的文件列表，包含处理后的文本内容和图片；imageAttachmentIds 与 images 按顺序一一对应（已同步存入 db.attachments，供 AI 用 insert_image_into_note 引用） */
  const [selectedFiles, setSelectedFiles] = useState<{ name: string, size: number, content: string, images?: string[], imageAttachmentIds?: string[] }[]>([]);
  /** 消息列表滚动容器引用，用于实现自动滚动 */
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** 聊天消息区域的滚动容器引用，用于判断用户是否在底部 */
  const chatScrollRef = useRef<HTMLDivElement>(null);
  /** 文件选择输入框引用 */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 标记用户是否手动滚动离开底部 */
  const userScrolledUp = useRef(false);
  /** 是否显示历史会话面板 */
  const [showHistory, setShowHistory] = useState(false);
  /**
   * Agent 运行模式
   * 'act': 快速执行模式，直接响应
   * 'plan': 深度规划模式，先思考后执行
   */
  const [mode, setMode] = useState<'act' | 'plan' | 'research'>('act');
  
  /**
   * 使用自定义 Hook 管理聊天会话
   * 包含消息列表、加载状态、流式渲染状态文字以及发送消息等核心逻辑
   */
  const { messages, loading, status, currentSessionId, sendMessage, clearSession, retry, stop, subAgentStates } = useChatSession(sessionId || null, mode);

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
   * 判断用户是否在聊天区域底部（阈值 100px 内视为在底部）
   */
  const isNearBottom = () => {
    const el = chatScrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  /**
   * 将消息列表滚动至底部
   * 只在用户未手动上翻时执行，避免干扰阅读历史消息
   */
  const scrollToBottom = () => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  /**
   * 核心滚动逻辑：当消息列表更新时自动触发滚动
   * 判断用户是否在底部 —— 在底部则自动跟滚，在上方翻阅历史则不打断
   */
  useEffect(() => {
    if (isNearBottom()) {
      userScrolledUp.current = false;
      scrollToBottom();
    } else {
      userScrolledUp.current = true;
    }
  }, [messages]);

  /**
   * 监听用户手动滚动 —— 如果在底部则重置标记，否则标记为已上翻
   */
  const handleScroll = () => {
    if (isNearBottom()) {
      userScrolledUp.current = false;
    } else {
      userScrolledUp.current = true;
    }
  };

  /**
   * 处理单个文件对象，执行解析、attachment 入库，返回可加入 selectedFiles 的条目。
   * 由 handleFileSelect 和 handlePaste 共用，避免重复逻辑。
   */
  const processFileEntry = async (file: File | Blob, displayName: string) => {
    const processed = await processFile(file as File);
    let imageAttachmentIds: string[] | undefined;
    if (processed.images && processed.images.length > 0) {
      imageAttachmentIds = await Promise.all(
        processed.images.map(async (dataUrl, idx) => {
          const id = generateUUID();
          const mimeMatch = dataUrl.match(/^data:([^;]+);/);
          await db.attachments.add({
            id,
            data: dataUrl,
            mimeType: mimeMatch?.[1] || 'image/png',
            fileName: processed.images!.length > 1 ? `${displayName} (${idx + 1})` : displayName,
            createdAt: Date.now(),
          });
          return id;
        })
      );
    }
    return {
      name: displayName,
      size: file.size,
      content: processed.text,
      images: processed.images,
      imageAttachmentIds,
    };
  };

  /**
   * 处理文件选择事件
   * 调用 processFile 提取文件内容（如 PDF 文本、图片等）并加入待发送列表
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      try {
        const newFiles: { name: string, size: number, content: string, images?: string[], imageAttachmentIds?: string[] }[] = [];
        for (let i = 0; i < files.length; i++) {
          newFiles.push(await processFileEntry(files[i], files[i].name));
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
   * 处理剪贴板粘贴事件：检测图片数据并加入待发送列表。
   * 仅处理剪贴板中的图片项（Blob），文本粘贴交由浏览器默认行为。
   * @param {React.ClipboardEvent} e
   */
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems: { blob: Blob; mimeType: string }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          imageItems.push({ blob, mimeType: item.type });
        }
      }
    }

    if (imageItems.length === 0) return; // 无图片，走默认文本粘贴

    // 阻止默认粘贴，图片由 selectedFiles 管理
    e.preventDefault();

    try {
      // 生成带时戳的文件名以便区分多次粘贴
      const now = new Date();
      const timestamp = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
      const ext = imageItems[0].mimeType.split('/')[1] || 'png';
      const newFiles: { name: string, size: number, content: string, images?: string[], imageAttachmentIds?: string[] }[] = [];
      for (let i = 0; i < imageItems.length; i++) {
        const displayName = imageItems.length > 1
          ? `剪贴板图片 ${timestamp} (${i + 1}).${ext}`
          : `剪贴板图片 ${timestamp}.${ext}`;
        newFiles.push(await processFileEntry(imageItems[i].blob, displayName));
      }
      setSelectedFiles(prev => [...prev, ...newFiles]);
    } catch (e) {
      console.error(e);
      showAlert('图片粘贴处理失败');
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

    // 发送新消息时重置滚动状态，确保能看到自己的消息
    userScrolledUp.current = false;

    const newSessionId = await sendMessage(content, files);
    if (newSessionId && newSessionId !== currentSessionId && onSessionChange) {
      onSessionChange(newSessionId);
    }
  };

  return (
    <div className={`flex flex-col h-full relative ${className || ''}`}>
      {/* Header Controls */}
      <div className="absolute top-2 left-4 right-4 z-20 flex justify-between items-center pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={handleNewChat}
            className="p-2 bg-white dark:bg-zinc-800 rounded-full shadow-md text-zinc-500 hover:text-primary border dark:border-zinc-700 transition-colors"
            title="新建对话"
          >
            <Plus size={18} />
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-2 bg-white dark:bg-zinc-800 rounded-full shadow-md text-zinc-500 hover:text-blue-600 border dark:border-zinc-700 transition-colors"
            title="历史对话"
          >
            <History size={18} />
          </button>
        </div>
      </div>

      {/* History Overlay */}
      {showHistory && (
        <div className="absolute inset-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl z-30 flex flex-col p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-4">
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
                <div className={`p-2 rounded-lg ${s.mode === 'plan' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : s.mode === 'research' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                   {s.mode === 'plan' ? <Brain size={16} /> : s.mode === 'research' ? <Microscope size={16} /> : <Zap size={16} />}
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

      <div
        ref={chatScrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6 pt-16 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-inner ${mode === 'plan' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500' : mode === 'research' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500' : 'bg-zinc-50 dark:bg-zinc-800/50 text-primary'}`}>
              {mode === 'plan' ? <Brain size={32} /> : mode === 'research' ? <Microscope size={32} /> : <Sparkles size={32} />}
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {mode === 'plan' ? "深度规划模式已开启" : mode === 'research' ? "深度研究模式已开启" : "快速执行模式已开启"}
              </p>
              <p className="text-xs text-zinc-400 max-w-[250px]">
                {mode === 'plan' ? "Agent 将先进行思考规划，再逐步执行复杂任务。" : mode === 'research' ? "Agent 将多阶段采集资料、委派子Agent并行研究，产出论文级深度报告。" : "Agent 将直接响应请求，快速执行操作。"}
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

          // 思考块「进行中」判定：含推理内容、尚未结束计时、且正处于生成中
          const thinkingActive = !!m.reasoning_content && m.reasoningTimeMs === undefined && loading;

          return (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              {m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0 ? (
                <div className="flex flex-col gap-2 max-w-[90%] md:max-w-[80%]">
                  {m.reasoning_content && (
                    <ThinkingBlock content={m.reasoning_content} durationMs={m.reasoningTimeMs} active={thinkingActive} />
                  )}
                  <ToolCallRenderer toolCalls={m.tool_calls} results={toolResults} subAgentStates={subAgentStates} />
                  {m.content && (
                    <div className="bg-white/70 dark:bg-zinc-800/80 backdrop-blur-sm shadow-sm rounded-2xl rounded-tl-sm ring-1 ring-zinc-900/5 dark:ring-zinc-100/10 p-4">
                      <MessageRenderer content={m.content as any} isUser={false} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-w-[90%] md:max-w-[80%]">
                  {m.reasoning_content && (
                    <ThinkingBlock content={m.reasoning_content} durationMs={m.reasoningTimeMs} active={thinkingActive} />
                  )}
                  <div className={`max-w-full p-4 relative group ${m.role === 'user'
                    ? 'bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 rounded-2xl rounded-tr-sm shadow-md'
                    : 'bg-white/70 dark:bg-zinc-800/80 backdrop-blur-sm shadow-sm rounded-2xl rounded-tl-sm ring-1 ring-zinc-900/5 dark:ring-zinc-100/10'
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
            <div key={i} className="relative backdrop-blur px-3 py-1.5 rounded-lg border flex items-center gap-2 max-w-[200px] shadow-sm animate-in zoom-in duration-200 bg-white/70 dark:bg-zinc-800/80 border-primary/20">
              {f.images && f.images.length > 0 ? (
                <div className="w-8 h-8 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-green-600 dark:text-green-400">IMG</span>
                </div>
              ) : (
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles size={14} className="text-primary" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">{f.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{formatFileSize(f.size)}</div>
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
        {/* 模型选择：保持原位置（输入框上方右侧）；工具开关与模式切换已下移至输入框底部 */}
        <div className="flex justify-end items-center gap-2 mb-2 pr-1">
          <ModelSwitcher />
        </div>
        <div className="bg-white/70 dark:bg-zinc-900/80 backdrop-blur-xl p-2 rounded-[1.5rem] shadow-lg border border-zinc-200/50 dark:border-zinc-800/50 ring-1 ring-black/5 dark:ring-white/5 transition-all focus-within:ring-primary/20 focus-within:border-primary/30">
          <textarea
            style={{ fontSize: 'var(--app-font-size, 14px)' }}
            className="w-full bg-transparent px-2 pt-2.5 pb-1 text-zinc-900 dark:text-zinc-100 focus:outline-none placeholder:text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed resize-none max-h-[150px] min-h-[48px]"
            value={input}
            placeholder={placeholder || "告诉 Agent 你想做什么..."}
            onPaste={handlePaste}
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
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={handleFileSelect}
          />
          {/* 底部控制条：左下角 = 文件上传 + 工具开关；右下角 = 模式切换 + 发送 */}
          <div className="flex justify-between items-center gap-2 pt-1">
            <div className="flex items-center gap-1">
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-zinc-400 hover:text-primary hover:bg-primary/10 rounded-full transition-all duration-300" title="上传文件">
                <Paperclip size={18} />
              </button>
              <ToolConfigSwitcher />
            </div>
            <div className="flex items-center gap-1.5">
              <ModeSwitcher mode={mode} onChange={setMode} align="right" />
              {loading ? (
                <button
                  onClick={stop}
                  className="p-2.5 rounded-full transition-all duration-300 shadow-sm bg-red-500 text-white hover:bg-red-600 hover:scale-105 active:scale-95"
                  title="停止生成"
                >
                  <Square size={16} className="fill-current" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() && selectedFiles.length === 0}
                  className={`p-2.5 rounded-full transition-all duration-300 shadow-sm ${!input.trim() && selectedFiles.length === 0
                    ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95'
                    }`}
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
