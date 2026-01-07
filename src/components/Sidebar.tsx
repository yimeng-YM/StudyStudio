import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { cn } from '@/lib/utils';
import { LayoutDashboard, BookOpen, Settings, Plus, Sparkles, Trash2, ArrowUp, ArrowDown, SortAsc, Clock, GripVertical, Folder } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useDialog } from '@/components/ui/DialogProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

function Logo({ onError }: { onError: () => void }) {
  return (
    <img
      src="/logo.png"
      alt="StudyStudio"
      className="w-auto h-auto max-w-full max-h-14 object-contain"
      onError={onError}
    />
  );
}

import { useResizable } from '@/hooks/useResizable';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

// ... (existing imports)

export function Sidebar() {
  const { width, startResizing } = useResizable({
    initialWidth: 256,
    minWidth: 200,
    maxWidth: 400,
    key: 'sidebarWidth',
    direction: 'right'
  });

  const [sortMode, setSortMode] = useState<'name' | 'lastAccessed' | 'manual'>(() =>
    (localStorage.getItem('sidebarSortMode') as any) || 'lastAccessed');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() =>
    (localStorage.getItem('sidebarSortDirection') as any) || 'desc');

  useEffect(() => {
    localStorage.setItem('sidebarSortMode', sortMode);
    localStorage.setItem('sidebarSortDirection', sortDirection);
  }, [sortMode, sortDirection]);

  const subjects = useLiveQuery(async () => {
    const all = await db.subjects.toArray();
    return all.sort((a, b) => {
      let valA: any, valB: any;
      if (sortMode === 'name') {
        valA = a.name;
        valB = b.name;
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortMode === 'lastAccessed') {
        valA = a.lastAccessed || 0;
        valB = b.lastAccessed || 0;
      } else if (sortMode === 'manual') {
        valA = a.order || 0;
        valB = b.order || 0;
      } else {
        valA = a.createdAt;
        valB = b.createdAt;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortMode, sortDirection]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [logoError, setLogoError] = useState(false);
  const { showConfirm } = useDialog();

  const moveSubject = async (e: React.MouseEvent, id: string, direction: 'up' | 'down') => {
    e.preventDefault();
    e.stopPropagation();
    if (!subjects) return;
    const index = subjects.findIndex(s => s.id === id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= subjects.length) return;
    const current = subjects[index];
    const target = subjects[targetIndex];
    await db.transaction('rw', db.subjects, async () => {
      await db.subjects.update(current.id, { order: target.order });
      await db.subjects.update(target.id, { order: current.order });
    });
  };

  const handleSubjectClick = async (id: string) => {
    await db.subjects.update(id, { lastAccessed: Date.now() });
  };

  const addSubject = async () => {
    if (newSubjectName.trim()) {
      const now = Date.now();
      await db.subjects.add({
        id: crypto.randomUUID(),
        name: newSubjectName,
        createdAt: now,
        lastAccessed: now,
        order: now
      });
      setIsAddModalOpen(false);
      setNewSubjectName('');
    }
  };

  const deleteSubject = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    const confirmed = await showConfirm(
      "确定要删除此学科吗？这将删除所有相关的笔记、导图和任务，且无法恢复。",
      { title: "删除学科", confirmText: "删除", cancelText: "取消" }
    );
    if (!confirmed) return;

    await db.transaction('rw', db.subjects, db.entities, db.chatSessions, db.chatMessages, async () => {
      await db.subjects.delete(id);
      const entities = await db.entities.where('subjectId').equals(id).toArray();
      await db.entities.where('subjectId').equals(id).delete();

      for (const ent of entities) {
        const sessions = await db.chatSessions.where('entityId').equals(ent.id).toArray();
        for (const sess of sessions) {
          await db.chatMessages.where('sessionId').equals(sess.id).delete();
          await db.chatSessions.delete(sess.id);
        }
      }
    });
  };

  return (
    <>
      <div
        style={{ width }}
        className="bg-slate-50 dark:bg-slate-900 h-screen border-r flex flex-col p-4 relative shrink-0" // removed w-64, added relative and shrink-0
      >
        <ResizeHandle
          onMouseDown={startResizing}
          className="absolute right-0 top-0 bottom-0 cursor-col-resize w-1 hover:w-1.5 active:w-1.5 hover:bg-blue-400/50 z-50 translate-x-1/2" // positioning handling
        />

        <div className={`flex items-center ${!logoError ? 'justify-center' : 'gap-2'} px-2 py-4 mb-4 min-h-[3.5rem]`}>
          {!logoError ? (
            <Logo onError={() => setLogoError(true)} />
          ) : (
            <>
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm shrink-0">
                S
              </div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">StudyStudio</h1>
            </>
          )}
        </div>

        <nav className="space-y-1 flex-1 overflow-y-auto">
          <NavLink
            to="/"
            className={({ isActive }) => cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isActive ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
            )}
          >
            <LayoutDashboard size={18} />
            首页
          </NavLink>

          <div className="pt-4 pb-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between items-center">
            <span>学科列表</span>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setSortMode('name')} className={cn("p-0.5 rounded", sortMode === 'name' ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20" : "text-slate-400 hover:text-slate-600")} title="名称"><SortAsc size={12} /></button>
              <button onClick={() => setSortMode('lastAccessed')} className={cn("p-0.5 rounded", sortMode === 'lastAccessed' ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20" : "text-slate-400 hover:text-slate-600")} title="时间"><Clock size={12} /></button>
              <button onClick={() => setSortMode('manual')} className={cn("p-0.5 rounded", sortMode === 'manual' ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20" : "text-slate-400 hover:text-slate-600")} title="手动"><GripVertical size={12} /></button>
              <button onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')} className="p-0.5 rounded text-slate-400 hover:text-slate-600" title="升序/降序">
                {sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              </button>
            </div>
          </div>

          {subjects?.map((subject, idx) => (
            <NavLink
              key={subject.id}
              to={`/subject/${subject.id}`}
              onClick={() => handleSubjectClick(subject.id)}
              className={({ isActive }) => cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors group justify-between animate-in slide-in-from-left duration-300",
                isActive ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
              )}
              style={{ animationDelay: `${idx * 20}ms` }}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <BookOpen size={18} className="shrink-0" />
                <span className="truncate">{subject.name}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {sortMode === 'manual' && (
                  <div className="flex flex-col gap-0.5" onClick={e => e.preventDefault()}>
                    <button onClick={(e) => moveSubject(e, subject.id, 'up')} disabled={idx === 0} className="text-slate-400 hover:text-slate-600 disabled:opacity-0"><ArrowUp size={10} /></button>
                    <button onClick={(e) => moveSubject(e, subject.id, 'down')} disabled={idx === (subjects?.length || 0) - 1} className="text-slate-400 hover:text-slate-600 disabled:opacity-0"><ArrowDown size={10} /></button>
                  </div>
                )}
                <button
                  onClick={(e) => deleteSubject(e, subject.id)}
                  className="p-1 text-slate-400 hover:text-red-600 transition-all"
                  title="删除学科"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </NavLink>
          ))}

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 mt-2 text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 rounded-md transition-colors"
          >
            <Plus size={18} />
            添加学科
          </button>
        </nav>

        <div className="border-t pt-4 space-y-1">
          <NavLink
            to="/ai-chat"
            className={({ isActive }) => cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors text-purple-600",
              isActive ? "bg-purple-100 dark:bg-purple-900/20" : "hover:bg-purple-50"
            )}
          >
            <Sparkles size={18} />
            AI 历史记录
          </NavLink>
          <NavLink
            to="/resources"
            className={({ isActive }) => cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isActive ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
            )}
          >
            <Folder size={18} />
            资料库
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isActive ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
            )}
          >
            <Settings size={18} />
            设置
          </NavLink>

          <div className="flex items-center justify-between px-3 py-2 mt-2">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">切换主题</span>
            <ThemeToggle />
          </div>
        </div>
      </div>
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="添加新学科"
        footer={
          <>
            <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">取消</button>
            <button onClick={addSubject} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">创建</button>
          </>
        }
      >
        <input
          className="w-full border rounded p-2 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="输入学科名称..."
          value={newSubjectName}
          onChange={e => setNewSubjectName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSubject()}
          autoFocus
        />
      </Modal>
    </>
  );
}
