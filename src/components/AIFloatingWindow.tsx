import { useState, useEffect } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { ChatWindow } from './ChatWindow';
import { Sparkles, X, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function AIFloatingWindow() {
    const {
        isFloatingWindowOpen,
        floatingWindowPosition,
        floatingWindowSize,
        setFloatingWindowOpen,
        setFloatingWindowPosition,
        setFloatingWindowSize,
        currentContext
    } = useAIStore();

    const [windowPos, setWindowPos] = useState({ x: 0, y: 0 });
    const [transformOrigin, setTransformOrigin] = useState('bottom right');

    const [isDragging, setIsDragging] = useState(false);
    const [isPreparingDrag, setIsPreparingDrag] = useState(false);
    const [isResizing, setIsResizing] = useState(false);

    const [dragType, setDragType] = useState<'button' | 'window' | null>(null);

    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });

    // Calculate Window Position and Origin on Open
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

            // Horizontal logic
            if (btnX > centerX) {
                targetX = btnX + btnSize - width;
                originX = 'right';
            } else {
                targetX = btnX;
                originX = 'left';
            }

            // Vertical logic
            if (btnY > centerY) {
                targetY = btnY - height - 10;
                originY = 'bottom';
            } else {
                targetY = btnY + btnSize + 10;
                originY = 'top';
            }

            // Constraint check
            if (targetX > maxX) targetX = maxX;
            if (targetX < padding) targetX = padding;
            if (targetY > maxY) targetY = maxY;
            if (targetY < padding) targetY = padding;

            setWindowPos({ x: targetX, y: targetY });
            setTransformOrigin(`${originY} ${originX}`);
        }
    }, [isFloatingWindowOpen, floatingWindowPosition, floatingWindowSize]);

    // Drag Start
    const startDrag = (e: React.MouseEvent, type: 'button' | 'window') => {
        if (type === 'window' && e.target instanceof Element && e.target.closest('button')) return;

        setIsPreparingDrag(true);
        setDragType(type);

        const currentPos = type === 'button' ? floatingWindowPosition : windowPos;

        setDragOffset({
            x: e.clientX - currentPos.x,
            y: e.clientY - currentPos.y
        });
        setDragStartPos({ x: e.clientX, y: e.clientY });
    };

    const startResize = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsResizing(true);
    };

    // Global Mouse Handling
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isPreparingDrag) {
                const dist = Math.sqrt(Math.pow(e.clientX - dragStartPos.x, 2) + Math.pow(e.clientY - dragStartPos.y, 2));
                if (dist > 3) {
                    setIsPreparingDrag(false);
                    setIsDragging(true);
                }
            } else if (isDragging) {
                const newX = e.clientX - dragOffset.x;
                const newY = e.clientY - dragOffset.y;

                if (dragType === 'button') {
                    setFloatingWindowPosition(newX, newY);
                } else if (dragType === 'window') {
                    setWindowPos({ x: newX, y: newY });
                }
            } else if (isResizing) {
                setFloatingWindowSize(
                    Math.max(300, e.clientX - windowPos.x),
                    Math.max(400, e.clientY - windowPos.y)
                );
            }
        };

        const handleMouseUp = () => {
            setIsPreparingDrag(false);
            setIsDragging(false);
            setIsResizing(false);
            setDragType(null);
        };

        if (isPreparingDrag || isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isPreparingDrag, isDragging, isResizing, dragType, dragStartPos, dragOffset, windowPos, setFloatingWindowPosition, setFloatingWindowSize, setWindowPos]);

    const overlay = (isDragging || isResizing) && (
        <div
            className="fixed inset-0 z-[100]"
            style={{ cursor: isResizing ? 'nwse-resize' : 'move', userSelect: 'none' }}
        />
    );

    return (
        <>
            {overlay}

            {/* Trigger Button - Always Visible & Independent Position */}
            <div
                className="fixed z-50 cursor-move"
                style={{
                    left: floatingWindowPosition.x,
                    top: floatingWindowPosition.y,
                }}
                onMouseDown={(e) => startDrag(e, 'button')}
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

            {/* Window */}
            <AnimatePresence>
                {isFloatingWindowOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
                        className="fixed z-[60] bg-white dark:bg-zinc-950 border dark:border-zinc-800 shadow-2xl rounded-xl overflow-hidden flex flex-col"
                        style={{
                            left: windowPos.x,
                            top: windowPos.y,
                            width: floatingWindowSize.width,
                            height: floatingWindowSize.height,
                            transformOrigin: transformOrigin
                        }}
                    >
                        {/* Header */}
                        <div
                            className="p-3 bg-zinc-50 dark:bg-zinc-900 border-b dark:border-zinc-800 flex items-center justify-between cursor-move select-none shrink-0"
                            onMouseDown={(e) => startDrag(e, 'window')}
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
                                    title="关闭"
                                >
                                    <Minus size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-hidden relative bg-white dark:bg-zinc-950">
                            <ChatWindow
                                sessionId={currentContext?.sessionId}
                                entityId={currentContext?.id}
                                sourceType={currentContext?.sourceType}
                                systemContext={currentContext?.getSystemContext}
                                onAICommand={currentContext?.handleCommand}
                                onSessionChange={currentContext?.onSessionChange}
                                placeholder={currentContext ? "针对当前内容提问，或输入指令..." : "你好，我是你的智能学习助手。"}
                            />
                        </div>

                        {/* Resize Handle */}
                        <div
                            className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-[70] flex items-end justify-end p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-tl transition-colors"
                            onMouseDown={startResize}
                            title="拖动调整大小"
                        >
                            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                                <path d="M21 15v6" />
                                <path d="M15 21h6" />
                                <path d="M21 9v2" />
                                <path d="M9 21h2" />
                            </svg>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
