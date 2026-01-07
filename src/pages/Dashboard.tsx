import { useMemo, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { BookOpen, CheckSquare, FileText, Trash2, ArrowUp, ArrowDown, Clock, GripVertical, SortAsc } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useDialog } from '@/components/ui/DialogProvider';
import { useAIStore } from '@/store/useAIStore';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export function Dashboard() {
  const subjectCount = useLiveQuery(() => db.subjects.count());
  const noteCount = useLiveQuery(() => db.entities.where({ type: 'note' }).count());
  
  const [sortMode, setSortMode] = useState<'name' | 'lastAccessed' | 'manual'>(() => 
      (localStorage.getItem('dashboardSortMode') as any) || 'lastAccessed');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => 
      (localStorage.getItem('dashboardSortDirection') as any) || 'desc');

  useEffect(() => {
      localStorage.setItem('dashboardSortMode', sortMode);
      localStorage.setItem('dashboardSortDirection', sortDirection);
  }, [sortMode, sortDirection]);

  const allSubjects = useLiveQuery(async () => {
    let collection = db.subjects.toCollection();
    
    if (sortMode === 'name') {
        collection = db.subjects.orderBy('name');
    } else if (sortMode === 'lastAccessed') {
        collection = db.subjects.orderBy('lastAccessed');
    } else if (sortMode === 'manual') {
        collection = db.subjects.orderBy('order');
    } else {
        collection = db.subjects.orderBy('createdAt');
    }
    
    if (sortDirection === 'desc') {
        collection = collection.reverse();
    }
    
    return await collection.toArray();
  }, [sortMode, sortDirection]);
  
  const taskBoards = useLiveQuery(() => db.entities.where({ type: 'task_board' }).toArray());
  const legacyTasks = useLiveQuery(() => 
    db.entities
      .filter(e => e.type === 'task' && e.content?.status === 'todo') // and !completed
      .reverse()
      .toArray()
  );
  const { showConfirm } = useDialog();
  const location = useLocation();
  const { setContext, setFloatingWindowOpen } = useAIStore();

  useEffect(() => {
    if (location.state?.openChatSessionId) {
       setContext({
           getSystemContext: () => "",
           sessionId: location.state.openChatSessionId,
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
  }, [location.state, setContext, setFloatingWindowOpen]);

  const recentTasks = useMemo(() => {
      const tasks: { id: string, title: string }[] = [];
      
      // Legacy
      if (legacyTasks) {
          tasks.push(...legacyTasks.map(t => ({ id: t.id, title: t.title })));
      }

      // Boards
      if (taskBoards) {
          taskBoards.forEach(board => {
              if (board.content?.nodes) {
                  board.content.nodes.forEach((node: any) => {
                      if (node.data?.items) {
                          node.data.items.forEach((item: any) => {
                              if (!item.completed) {
                                  tasks.push({ id: item.id, title: item.text });
                              }
                          });
                      }
                  });
              }
          });
      }
      return tasks.slice(0, 5);
  }, [taskBoards, legacyTasks]);

  const totalPendingTasks = useMemo(() => {
      let count = (legacyTasks?.length || 0);
      if (taskBoards) {
          taskBoards.forEach(board => {
              if (board.content?.nodes) {
                  board.content.nodes.forEach((node: any) => {
                      if (node.data?.items) {
                          count += node.data.items.filter((i: any) => !i.completed).length;
                      }
                  });
              }
          });
      }
      return count;
  }, [taskBoards, legacyTasks]);

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

  const handleSubjectClick = async (id: string) => {
      await db.subjects.update(id, { lastAccessed: Date.now() });
  };

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div>
           <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">欢迎回来</h1>
           <p className="text-slate-600 dark:text-slate-400">这里是你的学习概览。</p>
        </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-4"
         >
            <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600">
               <BookOpen size={24} />
            </div>
            <div>
               <div className="text-sm text-slate-500">总学科</div>
               <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{subjectCount || 0}</div>
            </div>
         </motion.div>
         <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-4"
         >
            <div className="p-4 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600">
               <FileText size={24} />
            </div>
            <div>
               <div className="text-sm text-slate-500">累计笔记</div>
               <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{noteCount || 0}</div>
            </div>
         </motion.div>
         <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-4"
         >
            <div className="p-4 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600">
               <CheckSquare size={24} />
            </div>
            <div>
               <div className="text-sm text-slate-500">待办任务</div>
               <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalPendingTasks}</div>
            </div>
         </motion.div>
      </div>

      <div className="space-y-8">
         {/* Recent Tasks */}
         <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">待办事项</h2>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
               {recentTasks?.map(task => (
                  <div key={task.id} className="p-4 border-b dark:border-slate-800 last:border-0 flex items-center gap-3">
                     <div className="w-5 h-5 rounded border border-slate-300 dark:border-slate-600" />
                     <span className="text-slate-700 dark:text-slate-300">{task.title}</span>
                  </div>
               ))}
               {(!recentTasks || recentTasks.length === 0) && (
                  <div className="p-8 text-center text-slate-500">
                     没有待办任务，真棒！
                  </div>
               )}
            </div>
         </div>

         {/* All Subjects Grid */}
         <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-4">
               <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">我的学科</h2>
               
               <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                    <button 
                        onClick={() => setSortMode('name')}
                        className={cn("p-1.5 rounded transition-colors", sortMode === 'name' ? "bg-slate-100 dark:bg-slate-800 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800")}
                        title="按名称排序"
                    ><SortAsc size={16} /></button>
                    <button 
                        onClick={() => setSortMode('lastAccessed')}
                        className={cn("p-1.5 rounded transition-colors", sortMode === 'lastAccessed' ? "bg-slate-100 dark:bg-slate-800 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800")}
                        title="按最近打开排序"
                    ><Clock size={16} /></button>
                    <button 
                        onClick={() => setSortMode('manual')}
                        className={cn("p-1.5 rounded transition-colors", sortMode === 'manual' ? "bg-slate-100 dark:bg-slate-800 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800")}
                        title="手动排序"
                    ><GripVertical size={16} /></button>
                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
                    <button 
                        onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title={sortDirection === 'asc' ? "升序" : "降序"}
                    >
                        {sortDirection === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                    </button>
                </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
               {allSubjects?.map((subject, idx) => (
                  <Link 
                     key={subject.id} 
                     to={`/subject/${subject.id}`}
                     onClick={() => handleSubjectClick(subject.id)}
                     className="block bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 hover:border-blue-500 transition-all group relative animate-in fade-in zoom-in duration-300"
                     style={{ animationDelay: `${idx * 50}ms` }}
                  >
                     <div className="flex items-start justify-between">
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 mb-4">
                           <BookOpen size={24} />
                        </div>
                        <div className="flex items-center gap-1">
                            {sortMode === 'manual' && (
                                <div className="flex flex-col gap-0.5 mr-2" onClick={(e) => e.preventDefault()}>
                                    <button 
                                        onClick={(e) => moveSubject(e, subject.id, 'up')} 
                                        disabled={idx === 0}
                                        className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                    ><ArrowUp size={14} /></button>
                                    <button 
                                        onClick={(e) => moveSubject(e, subject.id, 'down')} 
                                        disabled={idx === (allSubjects?.length || 0) - 1}
                                        className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                    ><ArrowDown size={14} /></button>
                                </div>
                            )}
                            <button 
                                onClick={(e) => deleteSubject(e, subject.id)}
                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                                title="删除学科"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                     </div>
                     <div>
                        <div className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-1 group-hover:text-blue-600 transition-colors">{subject.name}</div>
                        <div className="text-sm text-slate-500">创建于 {new Date(subject.createdAt).toLocaleDateString()}</div>
                     </div>
                  </Link>
               ))}
               {(!allSubjects || allSubjects.length === 0) && (
                  <div className="col-span-full text-center py-12 text-slate-500 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                     暂无学科，请点击侧边栏创建新学科
                  </div>
               )}
            </div>
         </div>
        </div>
      </div>
    </div>
  );
}
