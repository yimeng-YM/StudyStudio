import { useMemo, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { BookOpen, CheckSquare, FileText, ArrowUp, ArrowDown, Clock, GripVertical, SortAsc, CalendarDays } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { ICON_MAP } from '@/lib/icons';
import { useAIStore } from '@/store/useAIStore';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useDashboardContext } from '@/hooks/useUIContext';

/**
 * 仪表盘组件
 * 展示学习统计数据、学习时长日历、待办事项以及学科列表。
 */
export function Dashboard() {
    /** 注册仪表盘上下文，用于管理页面特定的 UI 状态 */
    useDashboardContext();
    
    // --- 基础统计数据查询 ---
    /** 学科总数统计 */
    const subjectCount = useLiveQuery(() => db.subjects.count());
    /** 笔记总数统计 */
    const noteCount = useLiveQuery(() => db.entities.where({ type: 'note' }).count());

    /** 实时系统时间状态 */
    const [currentTime, setCurrentTime] = useState(new Date());

    /** 每秒更新一次当前时间，驱动时钟 UI */
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    /** 格式化今日日期字符串 (YYYY-MM-DD) */
    const todayStr = currentTime.getFullYear() + '-' +
               String(currentTime.getMonth() + 1).padStart(2, '0') + '-' +
               String(currentTime.getDate()).padStart(2, '0');

    /**
     * 查询今日学习记录
     * 用于实时显示今日沉浸学习时长
     */
    const todayRecord = useLiveQuery(() => db.studyRecords?.get(todayStr), [todayStr]);
    const todayDuration = todayRecord?.duration || 0;

    /**
     * 格式化时长显示
     * @param {number} mins - 分钟数
     * @returns {string} 格式化后的字符串 (如 "1 小时 20 分钟")
     */
    const formatDuration = (mins: number) => {
        if (mins < 60) return `${mins} 分钟`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h} 小时 ${m} 分钟`;
    };

    /**
     * 计算并生成最近 30 天的学习打卡日历数据
     * 逻辑：
     * 1. 从数据库读取所有学习记录并转为 Map 提高查询效率
     * 2. 循环生成过去 30 天的日期序列
     * 3. 匹配每日学习时长，无记录则默认为 0
     */
    const calendarData = useLiveQuery(async () => {
        if (!db.studyRecords) return [];
        const records = await db.studyRecords.toArray();
        const map = new Map<string, number>();
        records.forEach(r => map.set(r.date, r.duration));
        
        const days = [];
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dStr = d.getFullYear() + '-' +
                         String(d.getMonth() + 1).padStart(2, '0') + '-' +
                         String(d.getDate()).padStart(2, '0');
            days.push({
                date: dStr,
                duration: map.get(dStr) || 0
            });
        }
        return days;
    }, []);

    const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateString = currentTime.toLocaleDateString([], { month: 'long', day: 'numeric', weekday: 'long' });

    /**
     * 学科列表排序模式
     * 支持：按名称、按最后访问、手动排序
     */
    const [sortMode, setSortMode] = useState<'name' | 'lastAccessed' | 'manual'>(() =>
        (localStorage.getItem('dashboardSortMode') as any) || 'lastAccessed');
    
    /** 排序方向：升序/降序 */
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() =>
        (localStorage.getItem('dashboardSortDirection') as any) || 'desc');

    /** 当排序配置变更时，持久化至本地存储 */
    useEffect(() => {
        localStorage.setItem('dashboardSortMode', sortMode);
        localStorage.setItem('dashboardSortDirection', sortDirection);
    }, [sortMode, sortDirection]);

    /**
     * 根据排序配置动态加载学科列表
     * 逻辑：根据 sortMode 映射到不同的数据库索引进行查询，并应用排序方向
     */
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

    /** 查询所有任务看板实体 */
    const taskBoards = useLiveQuery(() => db.entities.where({ type: 'task_board' }).toArray());
    /** 查询旧版独立任务（未完成） */
    const legacyTasks = useLiveQuery(() =>
        db.entities
            .filter(e => e.type === 'task' && e.content?.status === 'todo')
            .reverse()
            .toArray()
    );
    const location = useLocation();
    const { setFloatingWindowOpen, setGlobalSessionId } = useAIStore();

    /** 处理路由状态中携带的 AI 会话打开请求 */
    useEffect(() => {
        if (location.state?.openChatSessionId) {
            setGlobalSessionId(location.state.openChatSessionId);
            setFloatingWindowOpen(true);
        }
    }, [location.state, setGlobalSessionId, setFloatingWindowOpen]);

    /**
     * 汇总最近 5 条待办任务
     * 算法：
     * 1. 合并旧版独立任务
     * 2. 遍历所有任务看板中的未完成项
     * 3. 取前 5 项进行展示
     */
    const recentTasks = useMemo(() => {
        const tasks: { id: string, title: string }[] = [];

        if (legacyTasks) {
            tasks.push(...legacyTasks.map(t => ({ id: t.id, title: t.title })));
        }

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

    /**
     * 计算所有待办任务的总数
     * 用于仪表盘统计卡片展示
     */
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

    /**
     * 手动调整学科顺序
     * 通过交换两个学科的 order 字段实现位置互换，并在事务中执行以保证原子性
     * @param {React.MouseEvent} e - 事件对象
     * @param {string} id - 学科 ID
     * @param {'up' | 'down'} direction - 移动方向
     */
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

    /**
     * 处理学科卡片点击
     * 更新学科的最后访问时间，影响“最近访问”排序逻辑
     * @param {string} id - 学科 ID
     */
    const handleSubjectClick = async (id: string) => {
        await db.subjects.update(id, { lastAccessed: Date.now() });
    };

    return (
        <div className="h-full w-full overflow-y-auto">
            <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">欢迎回来</h1>
                    <p className="text-zinc-600 dark:text-zinc-400">这里是你的学习概览。</p>
                </div>

                {/* Time & Study Duration Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-xl shadow-md text-white flex flex-col justify-center relative overflow-hidden"
                    >
                        <div className="relative z-10">
                            <div className="text-sm text-blue-100 mb-1">{dateString}</div>
                            <div className="text-4xl font-bold tracking-tight">{timeString}</div>
                        </div>
                        <div className="absolute -right-6 -top-6 text-blue-400/30">
                            <Clock size={120} />
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white dark:bg-zinc-900/50 p-6 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                    >
                        <div>
                            <div className="text-sm text-zinc-500 dark:text-zinc-500 mb-1">今日沉浸时间</div>
                            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                                {formatDuration(todayDuration)}
                            </div>
                        </div>
                        <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-700 dark:text-zinc-300">
                            <Clock size={32} />
                        </div>
                    </motion.div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white dark:bg-zinc-900/50 p-6 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex items-center gap-4"
                    >
                        <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300">
                            <BookOpen size={24} />
                        </div>
                        <div>
                            <div className="text-sm text-zinc-500 dark:text-zinc-500">总学科</div>
                            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{subjectCount || 0}</div>
                        </div>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white dark:bg-zinc-900/50 p-6 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex items-center gap-4"
                    >
                        <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300">
                            <FileText size={24} />
                        </div>
                        <div>
                            <div className="text-sm text-zinc-500 dark:text-zinc-500">累计笔记</div>
                            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{noteCount || 0}</div>
                        </div>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-white dark:bg-zinc-900/50 p-6 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex items-center gap-4"
                    >
                        <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300">
                            <CheckSquare size={24} />
                        </div>
                        <div>
                            <div className="text-sm text-zinc-500 dark:text-zinc-500">待办任务</div>
                            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{totalPendingTasks}</div>
                        </div>
                    </motion.div>
                </div>

                <div className="space-y-8">
                    {/* Calendar Heatmap */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="text-zinc-800 dark:text-zinc-200" size={20} />
                            <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">学习打卡日历</h2>
                        </div>
                        <div className="bg-white dark:bg-zinc-900/50 p-6 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                            <div className="flex gap-2 min-w-max">
                                {calendarData?.map((day) => {
                                    let colorClass = "bg-zinc-100 dark:bg-zinc-800/50";
                                    if (day.duration > 0) colorClass = "bg-blue-200 dark:bg-blue-900/40";
                                    if (day.duration > 30) colorClass = "bg-blue-300 dark:bg-blue-800/60";
                                    if (day.duration > 60) colorClass = "bg-blue-400 dark:bg-blue-700/80";
                                    if (day.duration > 120) colorClass = "bg-blue-500 dark:bg-blue-600";
                                    
                                    return (
                                        <div 
                                            key={day.date} 
                                            className={cn("w-6 h-6 rounded-md transition-colors", colorClass)}
                                            title={`${day.date}: ${day.duration} 分钟`}
                                        />
                                    );
                                })}
                            </div>
                            <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                                <span>较少</span>
                                <div className="w-3 h-3 rounded-sm bg-zinc-100 dark:bg-zinc-800/50" />
                                <div className="w-3 h-3 rounded-sm bg-blue-200 dark:bg-blue-900/40" />
                                <div className="w-3 h-3 rounded-sm bg-blue-300 dark:bg-blue-800/60" />
                                <div className="w-3 h-3 rounded-sm bg-blue-400 dark:bg-blue-700/80" />
                                <div className="w-3 h-3 rounded-sm bg-blue-500 dark:bg-blue-600" />
                                <span>较多</span>
                            </div>
                        </div>
                    </div>

                    {/* Recent Tasks */}
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">待办事项</h2>
                        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                            {recentTasks?.map(task => (
                                <div key={task.id} className="p-4 border-b dark:border-zinc-800 last:border-0 flex items-center gap-3">
                                    <div className="w-5 h-5 rounded border border-zinc-300 dark:border-zinc-600" />
                                    <span className="text-zinc-700 dark:text-zinc-300">{task.title}</span>
                                </div>
                            ))}
                            {(!recentTasks || recentTasks.length === 0) && (
                                <div className="p-8 text-center text-zinc-500">
                                    没有待办任务，真棒！
                                </div>
                            )}
                        </div>
                    </div>

                    {/* All Subjects Grid */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center flex-wrap gap-4">
                            <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">我的学科</h2>

                            <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
                                <button
                                    onClick={() => setSortMode('name')}
                                    className={cn("p-1.5 rounded transition-colors", sortMode === 'name' ? "bg-zinc-100 dark:bg-zinc-800 text-blue-600" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800")}
                                    title="按名称排序"
                                ><SortAsc size={16} /></button>
                                <button
                                    onClick={() => setSortMode('lastAccessed')}
                                    className={cn("p-1.5 rounded transition-colors", sortMode === 'lastAccessed' ? "bg-zinc-100 dark:bg-zinc-800 text-blue-600" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800")}
                                    title="按最近打开排序"
                                ><Clock size={16} /></button>
                                <button
                                    onClick={() => setSortMode('manual')}
                                    className={cn("p-1.5 rounded transition-colors", sortMode === 'manual' ? "bg-zinc-100 dark:bg-zinc-800 text-blue-600" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800")}
                                    title="手动排序"
                                ><GripVertical size={16} /></button>
                                <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                                <button
                                    onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
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
                                    className="block bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 transition-all group relative animate-in fade-in zoom-in duration-300"
                                    style={{ animationDelay: `${idx * 50}ms` }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 mb-4">
                                            {(() => {
                                                const Icon = ICON_MAP[subject.icon || 'BookOpen'] || BookOpen;
                                                return <Icon size={24} />;
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {sortMode === 'manual' && (
                                                <div className="flex flex-col gap-0.5 mr-2" onClick={(e) => e.preventDefault()}>
                                                    <button
                                                        onClick={(e) => moveSubject(e, subject.id, 'up')}
                                                        disabled={idx === 0}
                                                        className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600 disabled:opacity-30"
                                                    ><ArrowUp size={14} /></button>
                                                    <button
                                                        onClick={(e) => moveSubject(e, subject.id, 'down')}
                                                        disabled={idx === (allSubjects?.length || 0) - 1}
                                                        className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600 disabled:opacity-30"
                                                    ><ArrowDown size={14} /></button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="font-semibold text-lg text-zinc-800 dark:text-zinc-200 mb-1 group-hover:text-blue-600 transition-colors">{subject.name}</div>
                                        <div className="text-sm text-zinc-500">创建于 {new Date(subject.createdAt).toLocaleDateString()}</div>
                                    </div>
                                </Link>
                            ))}
                            {(!allSubjects || allSubjects.length === 0) && (
                                <div className="col-span-full text-center py-12 text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
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
