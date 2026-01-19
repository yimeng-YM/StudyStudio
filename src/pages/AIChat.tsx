import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, ChatSession } from '@/db';
import { MessageSquare, Trash2, ChevronRight, ChevronDown, FileText, BrainCircuit, CheckSquare } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAIStore } from '@/store/useAIStore';
import { useDialog } from '@/components/ui/DialogProvider';

type Category = 'general' | 'note' | 'mindmap' | 'task';

interface GroupedSessions {
  general: ChatSession[];
  note: ChatSession[];
  mindmap: ChatSession[];
  task: ChatSession[];
}

export function AIChat() {
  const navigate = useNavigate();
  const { setContext, setFloatingWindowOpen } = useAIStore();
  const { showAlert, showConfirm } = useDialog();

  useEffect(() => {
    return () => setContext(null);
  }, [setContext]);

  const [expanded, setExpanded] = useState<Record<Category, boolean>>({
    general: true,
    note: true,
    mindmap: true,
    task: true
  });

  const toggleExpand = (cat: Category) => {
    setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const data = useLiveQuery(async () => {
    const sessions = await db.chatSessions.reverse().sortBy('updatedAt');
    const entities = await db.entities.toArray();
    const subjects = await db.subjects.toArray();
    return { sessions, entities, subjects };
  });

  const groupedSessions = useMemo<GroupedSessions>(() => {
    const groups: GroupedSessions = {
      general: [],
      note: [],
      mindmap: [],
      task: []
    };

    if (!data) return groups;

    const entityMap = new Map(data.entities.map(e => [e.id, e]));

    data.sessions.forEach(session => {
      // Prioritize explicit sourceType
      if (session.sourceType) {
        if (session.sourceType === 'mindmap') groups.mindmap.push(session);
        else if (session.sourceType === 'note') groups.note.push(session);
        else if (session.sourceType === 'task') groups.task.push(session);
        else groups.general.push(session);
        return;
      }

      // Fallback for older sessions
      if (!session.entityId) {
        groups.general.push(session);
      } else {
        const entity = entityMap.get(session.entityId);
        if (entity) {
          if (entity.type === 'note') groups.note.push(session);
          else if (entity.type === 'mindmap') groups.mindmap.push(session);
          else if (entity.type === 'task' || entity.type === 'task_board') groups.task.push(session);
          else groups.general.push(session);
        } else {
          groups.general.push(session);
        }
      }
    });

    return groups;
  }, [data]);

  const handleSessionClick = (session: ChatSession) => {
    // If it's explicitly general, just open floating window
    if (session.sourceType === 'general') {
      setContext({
        getSystemContext: () => "",
        sessionId: session.id,
        sourceType: 'general',
        onSessionChange: (id) => {
          setContext({
            getSystemContext: () => "",
            sessionId: id,
            sourceType: 'general'
          });
        }
      });
      setFloatingWindowOpen(true);
      return;
    }

    let handled = false;
    if (session.entityId) {
      const entity = data?.entities.find(e => e.id === session.entityId);
      if (entity) {
        const subject = data?.subjects.find(s => s.id === entity.subjectId);
        if (subject) {
          handled = true;
          if (entity.type === 'note') {
            navigate(`/subject/${subject.id}`, {
              state: { view: 'notes', initialNoteId: entity.id, openChatSessionId: session.id }
            });
          } else if (entity.type === 'mindmap') {
            navigate(`/subject/${subject.id}`, {
              state: { view: 'mindmap', openChatSessionId: session.id }
            });
          } else if (entity.type === 'task_board' || entity.type === 'task') {
            navigate(`/subject/${subject.id}`, {
              state: { view: 'tasks', openChatSessionId: session.id }
            });
          }
        }
      }
    }

    if (!handled) {
      // General session or Orphaned session: Open in floating window on current page
      setContext({
        getSystemContext: () => "",
        sessionId: session.id,
        id: undefined,
        onSessionChange: (id) => {
          setContext({
            getSystemContext: () => "",
            sessionId: id,
            id: undefined
          });
        }
      });
      setFloatingWindowOpen(true);
    }
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const confirmed = await showConfirm('确定要删除这段对话吗？', { title: '删除确认', confirmText: '删除', type: 'confirm' });
    if (confirmed) {
      await db.chatSessions.delete(id);
      await db.chatMessages.where('sessionId').equals(id).delete();
      const session = data?.sessions.find(s => s.id === id);
      if (session?.entityId) {
        const entity = await db.entities.get(session.entityId);
        if (entity && entity.chatSessionId === id) {
          await db.entities.update(entity.id, { chatSessionId: undefined });
        }
      }
      showAlert('回话已删除', { title: '成功' });
    }
  };

  const renderSessionItem = (session: ChatSession) => (
    <div
      key={session.id}
      onClick={() => handleSessionClick(session)}
      className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-md transition-all group"
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{session.title || '无标题会话'}</div>
        <div className="text-xs text-zinc-500 mt-1">更新于 {new Date(session.updatedAt).toLocaleString()}</div>
      </div>
      <button
        onClick={(e) => deleteSession(e, session.id)}
        className="opacity-0 group-hover:opacity-100 p-2 text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full transition-all"
        title="删除对话"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  const renderCategory = (category: Category, label: string, icon: React.ReactNode, list: ChatSession[]) => {
    if (list.length === 0) return null;
    const isExpanded = expanded[category];
    return (
      <div className="mb-6">
        <button
          onClick={() => toggleExpand(category)}
          className="flex items-center w-full p-2 text-lg font-bold text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors mb-2"
        >
          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <span className="ml-2 flex items-center gap-2">
            {icon}
            {label}
            <span className="bg-zinc-200 dark:bg-zinc-800 text-sm px-2 py-0.5 rounded-full font-normal text-zinc-600 dark:text-zinc-400">{list.length}</span>
          </span>
        </button>
        {isExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-4 animate-in slide-in-from-top-2 duration-300">
            {list.map(renderSessionItem)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-y-auto">
      <div className="p-8 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">AI 历史记录</h1>
          <p className="text-zinc-600 dark:text-zinc-400">查看所有的 AI 对话记录，点击即可跳转至对应场景继续对话。</p>
        </div>

        <div className="space-y-2">
          {renderCategory('general', '通用对话', <MessageSquare size={20} />, groupedSessions.general)}
          {renderCategory('note', '笔记助手', <FileText size={20} />, groupedSessions.note)}
          {renderCategory('mindmap', '思维导图', <BrainCircuit size={20} />, groupedSessions.mindmap)}
          {renderCategory('task', '任务规划', <CheckSquare size={20} />, groupedSessions.task)}

          {data?.sessions.length === 0 && (
            <div className="text-center text-zinc-400 py-20 bg-zinc-100 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800">
              暂无对话记录
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
