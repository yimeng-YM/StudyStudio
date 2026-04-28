import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { BookOpen, ArrowUp, ArrowDown, Clock, GripVertical, SortAsc, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ICON_MAP, ICON_OPTIONS } from '@/lib/icons';
import { cn, generateUUID } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Modal } from '@/components/ui/Modal';

export function MobileSubjects() {
  const [sortMode, setSortMode] = useState<'name' | 'lastAccessed' | 'manual'>(() =>
    (localStorage.getItem('dashboardSortMode') as any) || 'lastAccessed');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() =>
    (localStorage.getItem('dashboardSortDirection') as any) || 'desc');
  const [logoError, setLogoError] = useState(false);

  // Add subject modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('BookOpen');

  useEffect(() => {
    localStorage.setItem('dashboardSortMode', sortMode);
    localStorage.setItem('dashboardSortDirection', sortDirection);
  }, [sortMode, sortDirection]);

  const allSubjects = useLiveQuery(async () => {
    let collection = db.subjects.toCollection();
    if (sortMode === 'name') collection = db.subjects.orderBy('name');
    else if (sortMode === 'lastAccessed') collection = db.subjects.orderBy('lastAccessed');
    else if (sortMode === 'manual') collection = db.subjects.orderBy('order');
    else collection = db.subjects.orderBy('createdAt');
    if (sortDirection === 'desc') collection = collection.reverse();
    return await collection.toArray();
  }, [sortMode, sortDirection]);

  const handleSubjectClick = async (id: string) => {
    await db.subjects.update(id, { lastAccessed: Date.now() });
  };

  const moveSubject = async (e: React.MouseEvent, id: string, direction: 'up' | 'down') => {
    e.preventDefault();
    e.stopPropagation();
    if (!allSubjects) return;
    const index = allSubjects.findIndex(s => s.id === id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= allSubjects.length) return;
    const current = allSubjects[index];
    const target = allSubjects[targetIndex];
    await db.transaction('rw', db.subjects, async () => {
      await db.subjects.update(current.id, { order: target.order });
      await db.subjects.update(target.id, { order: current.order });
    });
  };

  const addSubject = async () => {
    if (newSubjectName.trim()) {
      const now = Date.now();
      await db.subjects.add({
        id: generateUUID(),
        name: newSubjectName,
        icon: selectedIcon,
        createdAt: now,
        lastAccessed: now,
        order: now
      });
      setIsAddModalOpen(false);
      setNewSubjectName('');
      setSelectedIcon('BookOpen');
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto pb-20">
      <div className="p-4 max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!logoError ? (
              <img src="/logos.png" alt="StudyStudio" className="w-7 h-7 object-contain" onError={() => setLogoError(true)} />
            ) : (
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">S</div>
            )}
            <span className="font-bold text-lg text-zinc-800 dark:text-zinc-100">我的学科</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 active:scale-95 transition-all"
            >
              <Plus size={16} />
              新建
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <button onClick={() => setSortMode('name')} className={cn("p-1.5 rounded transition-colors", sortMode === 'name' ? "bg-zinc-100 dark:bg-zinc-800 text-blue-600" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800")} title="按名称排序"><SortAsc size={16} /></button>
          <button onClick={() => setSortMode('lastAccessed')} className={cn("p-1.5 rounded transition-colors", sortMode === 'lastAccessed' ? "bg-zinc-100 dark:bg-zinc-800 text-blue-600" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800")} title="按最近打开排序"><Clock size={16} /></button>
          <button onClick={() => setSortMode('manual')} className={cn("p-1.5 rounded transition-colors", sortMode === 'manual' ? "bg-zinc-100 dark:bg-zinc-800 text-blue-600" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800")} title="手动排序"><GripVertical size={16} /></button>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
          <button onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors" title={sortDirection === 'asc' ? "升序" : "降序"}>
            {sortDirection === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          </button>
        </div>

        {/* Subjects Grid */}
        <div className="grid gap-3">
          {allSubjects?.map((subject, idx) => (
            <Link
              key={subject.id}
              to={`/subject/${subject.id}`}
              onClick={() => handleSubjectClick(subject.id)}
              className="flex items-center gap-4 bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 transition-all group animate-in fade-in slide-in-from-bottom-2 duration-300"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 shrink-0">
                {(() => {
                  const Icon = ICON_MAP[subject.icon || 'BookOpen'] || BookOpen;
                  return <Icon size={22} />;
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 transition-colors">{subject.name}</div>
                <div className="text-xs text-zinc-500">创建于 {new Date(subject.createdAt).toLocaleDateString()}</div>
              </div>
              {sortMode === 'manual' && (
                <div className="flex flex-col gap-0.5 shrink-0" onClick={e => e.preventDefault()}>
                  <button onClick={(e) => moveSubject(e, subject.id, 'up')} disabled={idx === 0}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600 disabled:opacity-30"><ArrowUp size={16} /></button>
                  <button onClick={(e) => moveSubject(e, subject.id, 'down')} disabled={idx === (allSubjects?.length || 0) - 1}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600 disabled:opacity-30"><ArrowDown size={16} /></button>
                </div>
              )}
            </Link>
          ))}
          {(!allSubjects || allSubjects.length === 0) && (
            <div className="text-center py-12 text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
              <BookOpen size={40} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-600" />
              <p className="font-medium">暂无学科</p>
              <p className="text-sm mt-1">点击右上角「新建」按钮创建学科</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Subject Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="添加新学科"
        footer={
          <>
            <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors">取消</button>
            <button onClick={addSubject} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity">创建</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">学科名称</label>
            <input
              className="w-full border rounded p-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="输入学科名称..."
              value={newSubjectName}
              onChange={e => setNewSubjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSubject()}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">选择图标</label>
            <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto p-2 border rounded dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
              {ICON_OPTIONS.map(iconName => {
                const Icon = ICON_MAP[iconName];
                return (
                  <button
                    key={iconName}
                    onClick={() => setSelectedIcon(iconName)}
                    className={cn(
                      "p-2 rounded-lg flex items-center justify-center transition-all",
                      selectedIcon === iconName
                        ? "bg-primary text-primary-foreground scale-110 shadow-sm"
                        : "text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    )}
                    title={iconName}
                  >
                    <Icon size={20} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
