import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { useAIStore } from '@/store/useAIStore';
// ChatWindow 懒加载：仅在用户打开 AI 浮窗时才加载聊天相关重依赖（MessageRenderer/mermaid/fileProcessor 等）
const ChatWindow = lazy(() => import('./ChatWindow').then(m => ({ default: m.ChatWindow })));
import { Sparkles, X, PanelRight, AppWindow } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { useAIBackgroundRuntime } from '@/services/aiTaskRuntime';

/**
 * AI 悬浮窗口组件
 *
 * 提供一个可拖拽、可调整大小的 AI 聊天界面，支持「悬浮窗」与「侧边栏」两种显示模式。
 *
 * 核心逻辑：
 * 1. 触发按钮与窗口解耦：开启窗口后按钮自动隐藏，关闭后按钮回到原位置；二者位置各自独立保存。
 * 2. 窗口位置独立：调整窗口大小不会把窗口拉回到按钮绑定的位置（修复了调整大小时窗口瞬间回弹的体验问题）。
 * 3. 悬浮窗模式：固定定位、可拖拽标题栏、右下角调整大小。
 * 4. 侧边栏模式：作为右侧停靠分栏（占据布局空间，挤压主内容），左侧边缘可拖拽调整宽度。
 * 5. 模式可自由切换；移动端固定为全屏弹层，不显示模式切换与侧边栏。
 */
export function AIFloatingWindow() {
    const {
        isFloatingWindowOpen,
        aiWindowMode,
        floatingButtonPosition,
        aiWindowPosition,
        floatingWindowSize,
        aiSidebarWidth,
        setFloatingWindowOpen,
        setAIWindowMode,
        setFloatingButtonPosition,
        setAIWindowPosition,
        setFloatingWindowSize,
        setAISidebarWidth,
        currentContext,
        globalSessionId,
        setGlobalSessionId,
    } = useAIStore();

    const isMobile = useIsMobile();
    const { runningCount, waitingCount } = useAIBackgroundRuntime();

    // 视口尺寸：侧边栏模式用 left/height 数值定位（贴右贴底），需监听 resize 实时更新
    const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
    useEffect(() => {
        const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // --- 交互状态 ---
    const [isDragging, setIsDragging] = useState(false);
    const [isPreparingDrag, setIsPreparingDrag] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const [dragType, setDragType] = useState<'button' | 'window' | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
    const [sidebarResizeStart, setSidebarResizeStart] = useState({ x: 0, width: 0 });

    // 将交互过程中需要读取的最新值通过 ref 透传给全局事件处理函数，
    // 避免 drag/resize 每帧 setState 触发 effect 重新订阅监听器。
    const interactionRef = useRef({
        isPreparingDrag, isDragging, isResizing, isResizingSidebar,
        dragType, dragOffset, dragStartPos, sidebarResizeStart,
        floatingButtonPosition, aiWindowPosition, floatingWindowSize, aiSidebarWidth,
    });
    interactionRef.current = {
        isPreparingDrag, isDragging, isResizing, isResizingSidebar,
        dragType, dragOffset, dragStartPos, sidebarResizeStart,
        floatingButtonPosition, aiWindowPosition, floatingWindowSize, aiSidebarWidth,
    };

    /**
     * 开启悬浮窗时，将其位置约束回视口内（例如浏览器尺寸变化后）。
     * 仅在打开瞬间执行一次，不依赖窗口尺寸，因此调整大小时不会触发回弹。
     */
    useEffect(() => {
        if (!isFloatingWindowOpen || isMobile || aiWindowMode !== 'floating') return;
        const { width, height } = floatingWindowSize;
        const padding = 8;
        let { x, y } = aiWindowPosition;
        const maxX = window.innerWidth - width - padding;
        const maxY = window.innerHeight - height - padding;
        if (x > maxX) x = Math.max(padding, maxX);
        if (y > maxY) y = Math.max(padding, maxY);
        if (x < padding) x = padding;
        if (y < padding) y = padding;
        if (x !== aiWindowPosition.x || y !== aiWindowPosition.y) setAIWindowPosition(x, y);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFloatingWindowOpen, aiWindowMode, isMobile]);

    /** 从鼠标/触摸事件中统一提取客户端坐标 */
    const getClientPos = (e: React.MouseEvent | React.TouchEvent) => {
        if ('touches' in e) {
            return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
        }
        return { clientX: e.clientX, clientY: e.clientY };
    };

    /**
     * 初始化拖拽状态
     * @param e 鼠标/触摸按下事件
     * @param type 拖拽对象类型 ('button' 悬浮按钮 | 'window' 窗口标题栏)
     */
    const startDrag = (e: React.MouseEvent | React.TouchEvent, type: 'button' | 'window') => {
        // 点击窗口内的按钮时不触发拖拽
        if (type === 'window' && e.target instanceof Element && e.target.closest('button')) return;

        setIsPreparingDrag(true);
        setDragType(type);

        const { clientX, clientY } = getClientPos(e);
        const currentPos = type === 'button' ? floatingButtonPosition : aiWindowPosition;

        setDragOffset({
            x: clientX - currentPos.x,
            y: clientY - currentPos.y
        });
        setDragStartPos({ x: clientX, y: clientY });
    };

    /** 初始化悬浮窗右下角尺寸调整 */
    const startResize = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        setIsResizing(true);
    };

    /** 初始化侧边栏左侧边缘宽度调整 */
    const startSidebarResize = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        const { clientX } = getClientPos(e);
        setSidebarResizeStart({ x: clientX, width: aiSidebarWidth });
        setIsResizingSidebar(true);
    };

    /**
     * 全局鼠标/触摸移动与松开事件处理，实现平滑的拖拽与缩放。
     * 仅在交互状态变化时订阅/解绑；过程中读取 interactionRef 的最新值。
     */
    useEffect(() => {
        const handleMove = (clientX: number, clientY: number) => {
            const s = interactionRef.current;

            if (s.isPreparingDrag) {
                // 移动超过 3px 才判定为拖拽，防止点击误触
                const dist = Math.sqrt(Math.pow(clientX - s.dragStartPos.x, 2) + Math.pow(clientY - s.dragStartPos.y, 2));
                if (dist > 3) {
                    setIsPreparingDrag(false);
                    setIsDragging(true);
                }
            } else if (s.isDragging) {
                let newX = clientX - s.dragOffset.x;
                let newY = clientY - s.dragOffset.y;

                if (s.dragType === 'button') {
                    // 悬浮按钮：约束在视口内
                    newX = Math.max(0, Math.min(newX, window.innerWidth - 60));
                    newY = Math.max(0, Math.min(newY, window.innerHeight - 60));
                    setFloatingButtonPosition(newX, newY);
                } else if (s.dragType === 'window') {
                    // 悬浮窗：约束不超出视口
                    const { width, height } = s.floatingWindowSize;
                    newX = Math.max(0, Math.min(newX, window.innerWidth - width - 8));
                    newY = Math.max(0, Math.min(newY, window.innerHeight - height - 8));
                    setAIWindowPosition(newX, newY);
                }
            } else if (s.isResizing) {
                // 悬浮窗右下角调整：宽度 = 光标 X - 窗口左边，高度 = 光标 Y - 窗口顶边
                const left = s.aiWindowPosition.x;
                const top = s.aiWindowPosition.y;
                const newWidth = Math.max(300, Math.min(window.innerWidth - left - 8, clientX - left));
                const newHeight = Math.max(400, Math.min(window.innerHeight - top - 8, clientY - top));
                setFloatingWindowSize(newWidth, newHeight);
            } else if (s.isResizingSidebar) {
                // 侧边栏左边缘调整：向左拖增大宽度
                const newWidth = Math.max(320, Math.min(window.innerWidth - 80, s.sidebarResizeStart.width + (s.sidebarResizeStart.x - clientX)));
                setAISidebarWidth(newWidth);
            }
        };

        const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);

        const handleTouchMove = (e: TouchEvent) => {
            const s = interactionRef.current;
            if (s.isPreparingDrag || s.isDragging || s.isResizing || s.isResizingSidebar) {
                e.preventDefault(); // 拖拽时阻止页面滚动
            }
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        };

        const handleEnd = () => {
            setIsPreparingDrag(false);
            setIsDragging(false);
            setIsResizing(false);
            setIsResizingSidebar(false);
            setDragType(null);
        };

        if (isPreparingDrag || isDragging || isResizing || isResizingSidebar) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleEnd);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [isPreparingDrag, isDragging, isResizing, isResizingSidebar, setFloatingButtonPosition, setAIWindowPosition, setFloatingWindowSize, setAISidebarWidth]);

    // 拖拽或缩放时的全屏遮罩，防止鼠标进入 iframe 或被其他元素拦截
    const overlay = (isDragging || isResizing || isResizingSidebar) && (
        <div
            className="fixed inset-0 z-[100]"
            style={{
                cursor: isResizingSidebar ? 'col-resize' : isResizing ? 'nwse-resize' : 'move',
                userSelect: 'none',
                touchAction: 'none',
            }}
        />
    );

    /** 当前是否处于侧边栏模式（仅桌面端） */
    const isSidebar = !isMobile && aiWindowMode === 'sidebar';
    /** 标题栏是否可拖拽（仅悬浮窗模式桌面端） */
    const titleDraggable = !isMobile && aiWindowMode === 'floating';

    /** 拖拽 / 调整大小 / 调整侧边栏宽度等交互进行中（期间定位属性实时跟手，不参与过渡） */
    const isInteracting = isDragging || isResizing || isResizingSidebar;
    /**
     * 窗口目标位置与尺寸（统一用 left/top/width/height）。
     * 模式切换时由 CSS transition 平滑过渡真实数值（内容 reflow 重排，而非 scale 拉伸变形），
     * 与占位条用相同时长/缓动，移动与让位同步；交互期间 transition 置 none 实时跟手。
     */
    const target = isMobile
        ? { left: 0, top: 0, width: viewport.w, height: viewport.h }
        : isSidebar
            ? { left: viewport.w - aiSidebarWidth, top: 0, width: aiSidebarWidth, height: viewport.h }
            : { left: aiWindowPosition.x, top: aiWindowPosition.y, width: floatingWindowSize.width, height: floatingWindowSize.height };

    // 标题栏：模式切换 + 收起按钮
    // 两种模式的顶栏配色统一为原悬浮窗配色（bg-zinc-50 / dark:bg-zinc-900）；
    // 侧边栏模式下内边距与学科界面顶栏对齐（宽度/高度），悬浮窗维持紧凑内边距
    const titleBar = (
        <div
            className={cn(
                "border-b dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between select-none shrink-0",
                isSidebar ? "px-4 md:px-8 py-2 md:py-4" : "p-3",
                titleDraggable && "cursor-move"
            )}
            style={{ touchAction: titleDraggable ? 'none' : undefined }}
            onMouseDown={titleDraggable ? (e) => startDrag(e, 'window') : undefined}
            onTouchStart={titleDraggable ? (e) => startDrag(e, 'window') : undefined}
        >
            <div className={cn(
                "flex items-center",
                isSidebar
                    // 侧边栏：复刻学科界面的左上角结构（py-1.5 内边距 + 28px 图标 + text-2xl 标题），使顶栏高度一致
                    ? "gap-2 md:gap-3 py-1.5"
                    : "gap-2 font-medium text-zinc-800 dark:text-zinc-100"
            )}>
                <Sparkles size={isSidebar ? 22 : 18} className={cn("text-blue-500 shrink-0", isSidebar && "md:w-7 md:h-7")} />
                <span className={isSidebar ? "text-lg md:text-2xl font-bold text-slate-800 dark:text-slate-100" : ""}>AI 助手</span>
                {currentContext && (
                    <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded ml-1">
                        当前环境
                    </span>
                )}
            </div>
            <div className="flex items-center gap-1">
                {/* 模式切换：桌面端在悬浮窗与侧边栏之间自由切换 */}
                {!isMobile && (
                    <button
                        onClick={() => setAIWindowMode(aiWindowMode === 'floating' ? 'sidebar' : 'floating')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition-colors"
                        title={aiWindowMode === 'floating' ? "切换为侧边栏模式" : "切换为悬浮窗模式"}
                    >
                        {aiWindowMode === 'floating' ? <PanelRight size={16} /> : <AppWindow size={16} />}
                    </button>
                )}
                <button
                    onClick={() => setFloatingWindowOpen(false)}
                    className="min-w-11 min-h-11 inline-flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 transition-colors"
                    title="收起"
                    aria-label={runningCount > 0 ? `收起 AI 助手，${runningCount} 个任务继续在后台运行` : '收起 AI 助手'}
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );

    // 聊天内容区（在窗口开启期间常驻挂载，模式切换不会导致其重挂载、丢失输入草稿）
    // 背景透明：由外层窗口容器提供底色（侧边栏为半透明毛玻璃，悬浮窗为不透明），弱化分界
    const chatContent = (
        <div className="flex-1 overflow-hidden relative">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-zinc-400">加载 AI 助手…</div>}>
                <ChatWindow
                    sessionId={globalSessionId}
                    onSessionChange={setGlobalSessionId}
                    placeholder={currentContext ? "针对当前内容提问，或输入指令..." : "你好，我是你的智能学习助手。"}
                />
            </Suspense>
        </div>
    );

    return (
        <>
            {overlay}

            {/* 触发按钮：仅在窗口收起时显示，位置独立保存 */}
            {!isFloatingWindowOpen && (
                <div
                    className="fixed z-50 cursor-move"
                    style={{
                        left: floatingButtonPosition.x,
                        top: floatingButtonPosition.y,
                        touchAction: 'none',
                    }}
                    onMouseDown={(e) => startDrag(e, 'button')}
                    onTouchStart={(e) => startDrag(e, 'button')}
                >
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setFloatingWindowOpen(true)}
                        className="min-w-[56px] min-h-[56px] p-4 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full shadow-lg shadow-blue-500/15 hover:bg-blue-200 dark:hover:bg-blue-900/60 active:scale-95 group relative flex items-center justify-center border border-blue-200 dark:border-blue-800/50"
                        title={runningCount > 0 ? `${runningCount} 个 AI 任务正在后台运行` : '打开 AI 助手'}
                        aria-label={runningCount > 0 ? `打开 AI 助手，${runningCount} 个任务正在后台运行` : '打开 AI 助手'}
                    >
                        <Sparkles size={24} className="group-hover:animate-pulse" />
                        {(runningCount > 0 || waitingCount > 0) && (
                            <span className={cn(
                                "absolute -right-1 -top-1 min-w-6 h-6 px-1 rounded-full text-[11px] font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-zinc-950",
                                runningCount > 0 ? "bg-blue-600" : "bg-amber-500"
                            )}>
                                {runningCount || waitingCount}
                            </span>
                        )}
                    </motion.button>
                </div>
            )}

            {/* 侧边栏占位条：sidebar 模式开启时占据布局空间，推动 main 平滑收缩/扩展。
                始终挂载，宽度在 0 ↔ aiSidebarWidth 间用 transition 过渡；main 为 flex-1，
                会随占位条宽度每帧重算而平滑跟随。拖拽调整侧边栏宽度时禁用 transition 保证跟手。 */}
            <div
                className="shrink-0 h-full"
                style={{
                    width: isSidebar && isFloatingWindowOpen ? aiSidebarWidth : 0,
                    transition: isResizingSidebar ? 'none' : 'width 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
            />

            {/* AI 对话窗口：同一容器随模式切换样式，避免重挂载 ChatWindow */}
            <AnimatePresence>
                {isFloatingWindowOpen && (
                    <motion.div
                        key="ai-window"
                        // 开/关动画用 transform（x/scale/y）+ opacity；模式切换的位移与缩放由下方
                        // style 的 left/top/width/height + CSS transition 平滑过渡（真实数值 reflow，
                        // 不用 scale 拉伸内容变形），与占位条相同时长/缓动同步。
                        initial={isSidebar
                            ? { opacity: 0, x: '100%' }
                            : { opacity: 0, scale: 0.94, y: 14 }}
                        animate={{ opacity: 1, x: 0, scale: 1, y: 0 }}
                        exit={isSidebar
                            ? { opacity: 0, x: '100%' }
                            : { opacity: 0, scale: 0.96, y: 14 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className={cn(
                            "fixed border dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col z-[60]",
                            isMobile
                                ? "rounded-none bg-white dark:bg-zinc-950"
                                : isSidebar
                                    // 侧边栏：半透明毛玻璃 + 左侧圆角（贴右，右侧靠视口边缘）
                                    ? "border-l rounded-l-xl bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl"
                                    : "rounded-xl bg-white dark:bg-zinc-950"
                        )}
                        style={{
                            left: target.left,
                            top: target.top,
                            width: target.width,
                            height: target.height,
                            // 交互期间禁用过渡实时跟手；否则模式切换用与占位条一致的 0.28s ease 平滑过渡
                            transition: isInteracting
                                ? 'none'
                                : 'left 0.28s cubic-bezier(0.22,1,0.36,1), top 0.28s cubic-bezier(0.22,1,0.36,1), width 0.28s cubic-bezier(0.22,1,0.36,1), height 0.28s cubic-bezier(0.22,1,0.36,1)',
                        }}
                    >
                        {titleBar}
                        {chatContent}

                        {/* 悬浮窗右下角调整大小手柄 */}
                        {!isMobile && aiWindowMode === 'floating' && (
                            <div
                                className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-[70] flex items-end justify-end p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-tl transition-colors"
                                style={{ touchAction: 'none' }}
                                onMouseDown={startResize}
                                onTouchStart={startResize}
                                title="拖动调整大小"
                            >
                                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                                    <path d="M21 15v6" />
                                    <path d="M15 21h6" />
                                    <path d="M21 9v2" />
                                    <path d="M9 21h2" />
                                </svg>
                            </div>
                        )}

                        {/* 侧边栏左侧边缘宽度调整手柄 */}
                        {!isMobile && isSidebar && (
                            <div
                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-[70] hover:bg-blue-400/50 hover:w-1.5 active:bg-blue-400 transition-colors"
                                style={{ touchAction: 'none' }}
                                onMouseDown={startSidebarResize}
                                onTouchStart={startSidebarResize}
                                title="拖动调整宽度"
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
