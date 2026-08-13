import { db, ChatSession } from '@/db';
import { MessageSquare, Trash2, Brain, Zap, Microscope, Pencil, Copy, Loader2, PauseCircle, CheckCircle2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAIStore } from '@/store/useAIStore';
import { useDialog } from '@/components/ui/DialogProvider';
import { useContextMenu } from '@/components/ui/ContextMenu';
import { buildChatTranscript } from '@/lib/chatTranscript';
import { useAIBackgroundRuntime } from '@/services/aiTaskRuntime';

/**
 * AI 聊天历史记录页面组件
 * 
 * 核心逻辑：
 * 1. 布局适配：作为独立的对话历史管理页面，提供响应式的网格布局展示所有 Agent 任务记录。
 * 2. 会话状态管理：
 *    - 使用 Dexie.js (useLiveQuery) 实时监听数据库中的聊天会话。
 *    - 支持点击会话后通过全局状态 (useAIStore) 唤起浮动窗口继续对话。
 *    - 提供会话及其关联消息的清理/删除功能。
 * 
 * @returns {JSX.Element} AIChat 页面组件
 */
export function AIChat() {
  const setGlobalSessionId = useAIStore(s => s.setGlobalSessionId);
  const setFloatingWindowOpen = useAIStore(s => s.setFloatingWindowOpen);
  const { showAlert, showConfirm, showPrompt } = useDialog();
  const { openContextMenu, contextMenu } = useContextMenu();
  const { snapshots, runningCount, waitingCount, detachSession } = useAIBackgroundRuntime();

  const sessions = useLiveQuery(async () => {
    return await db.chatSessions.reverse().sortBy('updatedAt');
  });

  /**
   * 处理会话点击事件，将选中的会话设置为全局活跃状态并打开 AI 助手
   * @param {ChatSession} session - 点击的会话对象
   */
  const handleSessionClick = (session: ChatSession) => {
    setGlobalSessionId(session.id);
    setFloatingWindowOpen(true);
  };

  /**
   * 删除指定的会话及其所有关联消息
   * @param {React.MouseEvent} e - 点击事件对象，用于阻止冒泡
   * @param {string} id - 要删除的会话 ID
   */
  const deleteSessionById = async (id: string) => {
    if (snapshots[id]?.loading) {
      showAlert('该任务仍在后台运行。请先打开会话并停止任务，再删除记录。', { title: '任务运行中' });
      return;
    }
    const confirmed = await showConfirm('确定要删除这段对话吗？', { title: '删除确认', confirmText: '删除', type: 'confirm' });
    if (confirmed) {
      await db.chatSessions.delete(id);
      await db.chatMessages.where('sessionId').equals(id).delete();
      detachSession(id);
      showAlert('会话已删除', { title: '成功' });
    }
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSessionById(id);
  };

  const renameSession = async (session: ChatSession) => {
    const title = await showPrompt('输入新的会话名称：', session.title || '', { title: '重命名会话' });
    if (!title?.trim()) return;
    await db.chatSessions.update(session.id, { title: title.trim(), updatedAt: Date.now() });
  };

  const copyTranscript = async (session: ChatSession) => {
    try {
      await navigator.clipboard.writeText(await buildChatTranscript(session.id));
      showAlert('会话内容已复制到剪贴板。', { title: '复制成功' });
    } catch {
      showAlert('无法访问剪贴板，请检查浏览器权限。', { title: '复制失败' });
    }
  };

  const handleSessionContextMenu = (event: React.MouseEvent, session: ChatSession) => {
    openContextMenu(event, [
      { key: 'open', label: '打开会话', icon: MessageSquare, onSelect: () => handleSessionClick(session) },
      { key: 'rename', label: '重命名', icon: Pencil, onSelect: () => renameSession(session) },
      { key: 'copy', label: '复制对话内容', icon: Copy, onSelect: () => copyTranscript(session) },
      { key: 'delete', label: '删除会话', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => deleteSessionById(session.id) },
    ], `会话：${session.title || '未命名会话'}`);
  };

  /**
   * 渲染单个会话列表项
   * @param {ChatSession} session - 会话数据
   */
  const renderSessionItem = (session: ChatSession) => {
    const task = snapshots[session.id];
    const state = task?.loading
      ? { label: '后台运行中', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: <Loader2 size={12} className="animate-spin" /> }
      : task?.phase === 'waiting_user'
        ? { label: '等待你的操作', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: <PauseCircle size={12} /> }
        : task?.phase === 'completed'
          ? { label: '后台已完成', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <CheckCircle2 size={12} /> }
          : null;

    return (
    <div
      key={session.id}
      onClick={() => handleSessionClick(session)}
      onContextMenu={(event) => handleSessionContextMenu(event, session)}
      className="flex items-center gap-4 p-4 bg-white/70 dark:bg-zinc-900/70 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-md transition-all group"
    >
      <div className={`p-3 rounded-lg flex-shrink-0 ${session.mode === 'plan' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : session.mode === 'research' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
        {session.mode === 'plan' ? <Brain size={24} /> : session.mode === 'research' ? <Microscope size={24} /> : <Zap size={24} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-lg text-zinc-800 dark:text-zinc-200 truncate">{session.title || '无标题任务'}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-zinc-500">{new Date(session.updatedAt).toLocaleString()}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${session.mode === 'plan' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : session.mode === 'research' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
            {session.mode === 'plan' ? '规划模式' : session.mode === 'research' ? '研究模式' : '执行模式'}
          </span>
          {state && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${state.className}`}>
              {state.icon}{state.label}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={(e) => deleteSession(e, session.id)}
        className="min-w-11 min-h-11 inline-flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all disabled:opacity-30"
        title="删除对话"
        aria-label={`删除会话：${session.title || '未命名会话'}`}
        disabled={task?.loading}
      >
        <Trash2 size={18} />
      </button>
    </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-20 md:pb-0">
      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1 md:mb-2">全局任务历史</h1>
          <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400">
            任务会在后台持续执行，可以放心切换页面或关闭聊天窗口。
            {(runningCount > 0 || waitingCount > 0) && ` 当前 ${runningCount} 个运行中，${waitingCount} 个等待操作。`}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions?.map(renderSessionItem)}

          {sessions?.length === 0 && (
            <div className="col-span-full text-center text-zinc-400 py-20 bg-white/70 dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800">
              <MessageSquare size={48} className="mx-auto mb-4 opacity-20" />
              暂无任务记录，请打开 AI 助手开始新的任务
            </div>
          )}
        </div>
      </div>
      {contextMenu}
    </div>
  );
}
