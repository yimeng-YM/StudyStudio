import { useState, useEffect } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { ChatWindow } from './ChatWindow';
import { Sparkles, X, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';

/**
 * AI 悬浮窗口组件
 * 
 * 提供一个可拖拽、可调整大小的 AI 聊天界面。
 * 包含一个独立的触发按钮和弹出式对话窗口。
 * 
 * 核心逻辑：
 * 1. 窗口定位：根据触发按钮的位置动态计算窗口弹出位置，并确保不超出屏幕边界。
 * 2. 拖拽处理：支持触发按钮和窗口标题栏的独立拖拽，通过全局鼠标事件监听实现平滑移动。
 * 3. 尺寸调整：右下角提供调整手柄，允许用户自定义窗口大小。
 * 4. 动画效果：使用 framer-motion 实现展开/收起的缩放和透明度渐变。
 */
export function AIFloatingWindow() {
    const {
        isFloatingWindowOpen,
        floatingWindowPosition,
        floatingWindowSize,
        setFloatingWindowOpen,
        setFloatingWindowPosition,
        setFloatingWindowSize,
        currentContext,
        globalSessionId,
        setGlobalSessionId
    } = useAIStore();

    const isMobile = useIsMobile();
    const [windowPos, setWindowPos] = useState({ x: 0, y: 0 });
    const [transformOrigin, setTransformOrigin] = useState('bottom right');

    const [isDragging, setIsDragging] = useState(false);
    const [isPreparingDrag, setIsPreparingDrag] = useState(false);
    const [isResizing, setIsResizing] = useState(false);

    const [dragType, setDragType] = useState<'button' | 'window' | null>(null);

    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });

    /**
     * 当窗口打开时，计算其相对于触发按钮的最佳弹出位置。
     * 逻辑包含：
     * - 水平方向：根据按钮在屏幕左右侧决定向左或向右展开。
     * - 垂直方向：根据按钮在屏幕上下侧决定向上或向下展开。
     * - 边界约束：确保窗口不会超出视口范围。
     */
    useEffect(() => {
        if (isFloatingWindowOpen) {
            const btnSize = 60;
            const btnX = floatingWindowPosition.x;
            const btnY = floatingWindowPosition.y;

            const { width, height } = floatingWindowSize;
            const padding = 20;

            const maxX = window.innerWidth - width - padding;
            const maxY = window.innerHeight - height - padding;

            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            let targetX = btnX;
            let targetY = btnY;

            let originY = 'top';
            let originX = 'left';

            // 水平定位逻辑
            if (btnX > centerX) {
                targetX = btnX + btnSize - width;
                originX = 'right';
            } else {
                targetX = btnX;
                originX = 'left';
            }

            // 垂直定位逻辑
            if (btnY > centerY) {
                targetY = btnY - height - 10;
                originY = 'bottom';
            } else {
                targetY = btnY + btnSize + 10;
                originY = 'top';
            }

            // 边界检查与约束
            if (targetX > maxX) targetX = maxX;
            if (targetX < padding) targetX = padding;
            if (targetY > maxY) targetY = maxY;
            if (targetY < padding) targetY = padding;

            setWindowPos({ x: targetX, y: targetY });
            setTransformOrigin(`${originY} ${originX}`);
        }
    }, [isFloatingWindowOpen, floatingWindowPosition, floatingWindowSize]);

    /**
     * 初始化拖拽状态
     * @param e 鼠标按下事件
     * @param type 拖拽对象类型 ('button' | 'window')
     */
    const getClientPos = (e: React.MouseEvent | React.TouchEvent) => {
        if ('touches' in e) {
            return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
        }
        return { clientX: e.clientX, clientY: e.clientY };
    };

    const startDrag = (e: React.MouseEvent | React.TouchEvent, type: 'button' | 'window') => {
        // 如果点击的是窗口内的按钮，不触发拖拽
        if (type === 'window' && e.target instanceof Element && e.target.closest('button')) return;

        setIsPreparingDrag(true);
        setDragType(type);

        const { clientX, clientY } = getClientPos(e);
        const currentPos = type === 'button' ? floatingWindowPosition : windowPos;

        setDragOffset({
            x: clientX - currentPos.x,
            y: clientY - currentPos.y
        });
        setDragStartPos({ x: clientX, y: clientY });
    };

    /**
     * 初始化尺寸调整状态
     */
    const startResize = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        setIsResizing(true);
    };

    /**
     * 处理全局鼠标移动和松开事件，实现平滑的拖拽和缩放体验
     */
    useEffect(() => {
        const handleMove = (clientX: number, clientY: number) => {
            if (isPreparingDrag) {
                // 只有移动超过 3px 才判定为拖拽，防止误触
                const dist = Math.sqrt(Math.pow(clientX - dragStartPos.x, 2) + Math.pow(clientY - dragStartPos.y, 2));
                if (dist > 3) {
                    setIsPreparingDrag(false);
                    setIsDragging(true);
                }
            } else if (isDragging) {
                const newX = clientX - dragOffset.x;
                const newY = clientY - dragOffset.y;

                if (dragType === 'button') {
                    setFloatingWindowPosition(newX, newY);
                } else if (dragType === 'window') {
                    setWindowPos({ x: newX, y: newY });
                }
            } else if (isResizing) {
                // 限制最小尺寸为 300x400
                setFloatingWindowSize(
                    Math.max(300, clientX - windowPos.x),
                    Math.max(400, clientY - windowPos.y)
                );
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            handleMove(e.clientX, e.clientY);
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (isPreparingDrag || isDragging || isResizing) {
                e.preventDefault(); // 拖拽时阻止页面滚动
            }
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        };

        const handleEnd = () => {
            setIsPreparingDrag(false);
            setIsDragging(false);
            setIsResizing(false);
            setDragType(null);
        };

        if (isPreparingDrag || isDragging || isResizing) {
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
    }, [isPreparingDrag, isDragging, isResizing, dragType, dragStartPos, dragOffset, windowPos, setFloatingWindowPosition, setFloatingWindowSize, setWindowPos]);

    // 拖拽或缩放时的全屏遮罩，防止鼠标进入 iframe 或被其他元素拦截
    const overlay = (isDragging || isResizing) && (
        <div
            className="fixed inset-0 z-[100]"
            style={{ cursor: isResizing ? 'nwse-resize' : 'move', userSelect: 'none', touchAction: 'none' }}
        />
    );

    return (
        <>
            {overlay}

            {/* 触发按钮 - 移动端窗口打开时隐藏 */}
            {(!isMobile || !isFloatingWindowOpen) && (
            <div
                className="fixed z-50 cursor-move"
                style={{
                    left: floatingWindowPosition.x,
                    top: floatingWindowPosition.y,
                    touchAction: 'none',
                }}
                onMouseDown={(e) => startDrag(e, 'button')}
                onTouchStart={(e) => startDrag(e, 'button')}
            >
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                        setFloatingWindowOpen(!isFloatingWindowOpen);
                    }}
                    className="p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 active:scale-95 group relative flex items-center justify-center"
                    title={isFloatingWindowOpen ? "关闭 AI 助手" : "打开 AI 助手"}
                >
                    {isFloatingWindowOpen ? <X size={24} /> : <Sparkles size={24} className="group-hover:animate-pulse" />}
                </motion.button>
            </div>
            )}

            {/* AI 对话窗口 */}
            <AnimatePresence>
                {isFloatingWindowOpen && (
                  <motion.div
                    initial={isMobile ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                    animate={{
                        opacity: 1,
                        scale: 1,
                        pointerEvents: 'auto'
                    }}
                    exit={isMobile ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
                    className={cn(
                      "fixed z-[60] bg-white dark:bg-zinc-950 border dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col",
                      isMobile
                        ? "inset-0 rounded-none"
                        : "rounded-xl"
                    )}
                    style={isMobile ? undefined : {
                        left: windowPos.x,
                        top: windowPos.y,
                        width: floatingWindowSize.width,
                        height: floatingWindowSize.height,
                        transformOrigin: transformOrigin,
                    }}
                  >
                        {/* 标题栏 - 桌面端支持拖拽 */}
                        <div
                            className={cn(
                              "p-3 bg-zinc-50 dark:bg-zinc-900 border-b dark:border-zinc-800 flex items-center justify-between select-none shrink-0",
                              !isMobile && "cursor-move"
                            )}
                            style={{ touchAction: isMobile ? undefined : 'none' }}
                            onMouseDown={isMobile ? undefined : (e) => startDrag(e, 'window')}
                            onTouchStart={isMobile ? undefined : (e) => startDrag(e, 'window')}
                        >
                            <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100">
                                <Sparkles size={18} className="text-blue-500" />
                                <span>AI 助手</span>
                                {currentContext && (
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded ml-1">
                                        当前环境
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setFloatingWindowOpen(false)}
                                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition-colors"
                                    title="最小化"
                                >
                                    <Minus size={16} />
                                </button>
                            </div>
                        </div>

                        {/* 聊天内容区域 */}
                        <div className="flex-1 overflow-hidden relative bg-white dark:bg-zinc-950">
                            <ChatWindow
                                sessionId={globalSessionId}
                                onSessionChange={setGlobalSessionId}
                                placeholder={currentContext ? "针对当前内容提问，或输入指令..." : "你好，我是你的智能学习助手。"}
                            />
                        </div>

                        {/* 调整大小手柄 - 桌面端 */}
                        {!isMobile && (
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
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
