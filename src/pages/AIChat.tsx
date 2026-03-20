import { db, ChatSession } from '@/db';
import { MessageSquare, Trash2, Brain, Zap } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAIStore } from '@/store/useAIStore';
import { useDialog } from '@/components/ui/DialogProvider';

export function AIChat() {
  const { setGlobalSessionId, setFloatingWindowOpen } = useAIStore();
  const { showAlert, showConfirm } = useDialog();

  const sessions = useLiveQuery(async () => {
    return await db.chatSessions.reverse().sortBy('updatedAt');
  });

  const handleSessionClick = (session: ChatSession) => {
    setGlobalSessionId(session.id);
    setFloatingWindowOpen(true);
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const confirmed = await showConfirm('确定要删除这段对话吗？', { title: '删除确认', confirmText: '删除', type: 'confirm' });
    if (confirmed) {
      await db.chatSessions.delete(id);
      await db.chatMessages.where('sessionId').equals(id).delete();
      showAlert('会话已删除', { title: '成功' });
    }
  };

  const renderSessionItem = (session: ChatSession) => (
    <div
      key={session.id}
      onClick={() => handleSessionClick(session)}
      className="flex items-center gap-4 p-4 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-md transition-all group"
    >
      <div className={`p-3 rounded-lg flex-shrink-0 ${session.mode === 'plan' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
        {session.mode === 'plan' ? <Brain size={24} /> : <Zap size={24} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-lg text-zinc-800 dark:text-zinc-200 truncate">{session.title || '无标题任务'}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-zinc-500">{new Date(session.updatedAt).toLocaleString()}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${session.mode === 'plan' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
            {session.mode === 'plan' ? '规划模式' : '执行模式'}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => deleteSession(e, session.id)}
        className="opacity-0 group-hover:opacity-100 p-2.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all"
        title="删除对话"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-y-auto">
      <div className="p-8 max-w-5xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">全局任务历史</h1>
          <p className="text-zinc-600 dark:text-zinc-400">查看所有的 Agent 任务流转记录。现在不再按页面分类，所有操作都在统一的会话中完成。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions?.map(renderSessionItem)}

          {sessions?.length === 0 && (
            <div className="col-span-full text-center text-zinc-400 py-20 bg-white dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800">
              <MessageSquare size={48} className="mx-auto mb-4 opacity-20" />
              暂无任务记录，请打开 AI 助手开始新的任务
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
