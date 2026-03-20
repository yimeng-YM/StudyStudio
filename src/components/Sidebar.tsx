import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { cn } from '@/lib/utils';
import { LayoutDashboard, BookOpen, Settings, Plus, Sparkles, ArrowUp, ArrowDown, SortAsc, Clock, GripVertical, HelpCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ThemeToggle } from '@/components/ThemeToggle';



import { useResizable } from '@/hooks/useResizable';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { ICON_MAP, ICON_OPTIONS } from '@/lib/icons';

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
  const [selectedIcon, setSelectedIcon] = useState('BookOpen');
  const [logoError, setLogoError] = useState(false);

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


  const [isCollapsed, setIsCollapsed] = useState(false);

  // Toggle Collapse
  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev);
    // When collapsing, reset width to min or auto? Actually useResizable manages width. 
    // We'll just force width control via style override or let user resize?
    // User request: "Collapsed" implies fixed small width.
  };

  const sidebarWidth = isCollapsed ? 74 : width;

  return (
    <>
      <div
        style={{ width: sidebarWidth }}
        className="bg-white/60 dark:bg-zinc-950 backdrop-blur-xl h-screen border-r border-slate-200/50 dark:border-zinc-800/50 flex flex-col p-4 relative shrink-0 transition-[width] duration-300 ease-in-out"
      >
        {!isCollapsed && (
          <ResizeHandle
            onMouseDown={startResizing}
            className="absolute right-0 top-0 bottom-0 cursor-col-resize w-1 hover:w-1.5 active:w-1.5 hover:bg-blue-400/50 z-50 translate-x-1/2"
          />
        )}



        <div className={`flex items-center ${isCollapsed ? 'justify-center' : (!logoError ? 'justify-center' : 'gap-2')} px-0 py-4 mb-4 min-h-[3.5rem] relative`}>
          {!logoError ? (
            <img
              src={isCollapsed ? "/logos.png" : "/logo.png?v=1"}
              alt="StudyStudio"
              className={cn("object-contain transition-all duration-300", isCollapsed ? "w-8 h-8" : "w-auto h-auto max-w-full max-h-14")}
              onError={() => setLogoError(true)}
            />
          ) : (
            <>
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm shrink-0">
                S
              </div>
              {!isCollapsed && <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap overflow-hidden">StudyStudio</h1>}
            </>
          )}


        </div>

        <nav className="space-y-1 flex-1 overflow-y-auto scrollbar-none">
          <NavLink
            to="/"
            className={({ isActive }) => cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 hover:-translate-y-0.5",
              isActive ? "bg-primary text-primary-foreground dark:bg-zinc-800/80 dark:text-zinc-100 shadow-md shadow-primary/20 dark:shadow-none" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              isCollapsed && "justify-center px-0"
            )}
            title={isCollapsed ? "首页" : undefined}
          >
            <LayoutDashboard size={20} className="shrink-0" />
            {!isCollapsed && <span>首页</span>}
          </NavLink>

          {!isCollapsed && (
            <div className="pt-4 pb-2 px-3 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex justify-between items-center whitespace-nowrap overflow-hidden">
              <span>学科列表</span>
              <div className="flex items-center gap-0.5">
                <button onClick={() => setSortMode('name')} className={cn("p-0.5 rounded", sortMode === 'name' ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground")} title="名称"><SortAsc size={12} /></button>
                <button onClick={() => setSortMode('lastAccessed')} className={cn("p-0.5 rounded", sortMode === 'lastAccessed' ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground")} title="时间"><Clock size={12} /></button>
                <button onClick={() => setSortMode('manual')} className={cn("p-0.5 rounded", sortMode === 'manual' ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground")} title="手动"><GripVertical size={12} /></button>
                <button onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')} className="p-0.5 rounded text-muted-foreground hover:text-foreground" title="升序/降序">
                  {sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                </button>
              </div>
            </div>
          )}
          {isCollapsed && <div className="h-4" />}

          {subjects?.map((subject, idx) => (
            <NavLink
              key={subject.id}
              to={`/subject/${subject.id}`}
              onClick={() => handleSubjectClick(subject.id)}
              className={({ isActive }) => cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 group justify-between animate-in slide-in-from-left hover:-translate-y-0.5",
                isActive ? "bg-primary text-primary-foreground dark:bg-zinc-800/80 dark:text-zinc-100 shadow-md shadow-primary/20 dark:shadow-none is-active" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                isCollapsed && "justify-center px-0"
              )}
              style={{ animationDelay: `${idx * 20}ms` }}
              title={isCollapsed ? subject.name : undefined}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {(() => {
                  const Icon = ICON_MAP[subject.icon || 'BookOpen'] || BookOpen;
                  return <Icon size={18} className="shrink-0" />;
                })()}
                {!isCollapsed && <span className="truncate">{subject.name}</span>}
              </div>
              {!isCollapsed && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {sortMode === 'manual' && (
                    <div className="flex flex-col gap-0.5" onClick={e => e.preventDefault()}>
                      <button onClick={(e) => moveSubject(e, subject.id, 'up')} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-0"><ArrowUp size={10} /></button>
                      <button onClick={(e) => moveSubject(e, subject.id, 'down')} disabled={idx === (subjects?.length || 0) - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-0"><ArrowDown size={10} /></button>
                    </div>
                  )}
                </div>
              )}
            </NavLink>
          ))}

          <button
            onClick={() => setIsAddModalOpen(true)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 mt-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors",
              isCollapsed && "justify-center px-0"
            )}
            title={isCollapsed ? "添加学科" : undefined}
          >
            <Plus size={18} />
            {!isCollapsed && "添加学科"}
          </button>
        </nav>

        <div className="border-t dark:border-zinc-800/50 pt-4 space-y-1">
          <NavLink
            to="/ai-chat"
            className={({ isActive }) => cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 hover:-translate-y-0.5",
              isActive ? "bg-primary text-primary-foreground dark:bg-zinc-800/80 dark:text-zinc-100 shadow-md shadow-primary/20 dark:shadow-none" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              isCollapsed && "justify-center px-0"
            )}
            title={isCollapsed ? "AI 历史记录" : undefined}
          >
            <Sparkles size={18} />
            {!isCollapsed && "AI 历史记录"}
          </NavLink>
          <NavLink
            to="/docs"
            className={({ isActive }) => cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 hover:-translate-y-0.5",
              isActive ? "bg-primary text-primary-foreground dark:bg-zinc-800/80 dark:text-zinc-100 shadow-md shadow-primary/20 dark:shadow-none" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              isCollapsed && "justify-center px-0"
            )}
            title={isCollapsed ? "使用文档" : undefined}
          >
            <HelpCircle size={18} />
            {!isCollapsed && "使用文档"}
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 hover:-translate-y-0.5",
              isActive ? "bg-primary text-primary-foreground dark:bg-zinc-800/80 dark:text-zinc-100 shadow-md shadow-primary/20 dark:shadow-none" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              isCollapsed && "justify-center px-0"
            )}
            title={isCollapsed ? "设置" : undefined}
          >
            <Settings size={18} />
            {!isCollapsed && "设置"}
          </NavLink>

          <div className={cn("flex items-center justify-between px-3 py-2 mt-2", isCollapsed && "justify-center px-0 flex-col gap-2")}>
            <button
              onClick={toggleCollapse}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
              title={isCollapsed ? "展开" : "收起侧边栏"}
            >
              <GripVertical size={20} className={cn("transition-transform", isCollapsed && "rotate-90")} />
            </button>
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

    </>
  );
}
