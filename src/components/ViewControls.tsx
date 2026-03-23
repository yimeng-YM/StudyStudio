import { useReactFlow } from 'reactflow';
import { Plus, Minus, Maximize, Lock, Unlock, Undo, Redo, MousePointer2, Move, Trash, Layout as ChevronUp, ArrowRight, ArrowDown, ArrowUp, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

/**
 * 视图控制按钮组件属性
 */
interface ViewControlsProps {
    className?: string; // 额外的样式类
    onUndo?: () => void; // 撤销回调
    onRedo?: () => void; // 重做回调
    canUndo?: boolean;   // 是否可撤销
    canRedo?: boolean;   // 是否可重做
    isSelectionMode?: boolean; // 是否处于框选模式
    onSelectionModeChange?: (isSelection: boolean) => void; // 框选模式切换回调
    onDeleteSelected?: () => void; // 删除选中项回调
    onLayoutSelected?: (dir: 'LR' | 'RL' | 'TB' | 'BT') => void; // 整理选中项回调
    hasSelection?: boolean; // 当前是否有选中项
}

/**
 * 画布视图控制组件
 * 
 * 为 React Flow 提供常用的画布操作控件。
 */
export function ViewControls({ 
    className, 
    onUndo, 
    onRedo, 
    canUndo, 
    canRedo, 
    isSelectionMode, 
    onSelectionModeChange,
    onDeleteSelected,
    onLayoutSelected,
    hasSelection
}: ViewControlsProps) {
    const { zoomIn, zoomOut, fitView, getNodes, setNodes } = useReactFlow();
    const [isLocked, setIsLocked] = useState(false);
    const [showSelectionMenu, setShowSelectionMenu] = useState(false);

    // 点击外部关闭菜单
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (showSelectionMenu && !(e.target as HTMLElement).closest('.selection-menu-container')) {
                setShowSelectionMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showSelectionMenu]);

    /**
     * 切换画布锁定状态
     */
    const toggleLock = () => {
        const newLockedState = !isLocked;
        setIsLocked(newLockedState);

        setNodes(getNodes().map(node => ({
            ...node,
            draggable: !newLockedState,
            selectable: !newLockedState,
        })));
    };

    return (
        <div className={cn("flex items-end gap-1 z-50", className)}>
            <div className="flex gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 shadow-lg relative">
                {/* 模式切换组 */}
                {onSelectionModeChange && (
                    <>
                        <button
                            onClick={() => {
                                onSelectionModeChange(false);
                                setShowSelectionMenu(false);
                            }}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                !isSelectionMode ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            )}
                            title="拖拽模式"
                        >
                            <Move size={18} />
                        </button>
                        
                        <div className="relative selection-menu-container">
                            <button
                                onClick={() => {
                                    if (isSelectionMode) {
                                        setShowSelectionMenu(!showSelectionMenu);
                                    } else {
                                        onSelectionModeChange(true);
                                    }
                                }}
                                className={cn(
                                    "p-1.5 rounded-md transition-colors flex items-center gap-0.5",
                                    isSelectionMode ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                )}
                                title={isSelectionMode ? "点击打开选择菜单" : "框选模式"}
                            >
                                <MousePointer2 size={18} />
                                {isSelectionMode && <ChevronUp size={12} className={cn("transition-transform", showSelectionMenu && "rotate-180")} />}
                            </button>

                            {/* 框选模式二级菜单 */}
                            {showSelectionMenu && isSelectionMode && (
                                <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl p-1 min-w-[120px] animate-in fade-in slide-in-from-bottom-2">
                                    <button
                                        onClick={() => {
                                            onDeleteSelected?.();
                                            setShowSelectionMenu(false);
                                        }}
                                        disabled={!hasSelection}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-30 transition-colors"
                                    >
                                        <Trash size={14} />
                                        删除选中
                                    </button>
                                    
                                    {onLayoutSelected && (
                                        <div className="mt-1 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                                            <div className="px-2 py-1 text-[10px] text-zinc-400 uppercase font-semibold">整理选中节点</div>
                                            <div className="grid grid-cols-2 gap-1">
                                                <button
                                                    onClick={() => { onLayoutSelected('LR'); setShowSelectionMenu(false); }}
                                                    disabled={!hasSelection}
                                                    className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                                >
                                                    <ArrowRight size={12} /> 右
                                                </button>
                                                <button
                                                    onClick={() => { onLayoutSelected('RL'); setShowSelectionMenu(false); }}
                                                    disabled={!hasSelection}
                                                    className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                                >
                                                    <ArrowLeft size={12} /> 左
                                                </button>
                                                <button
                                                    onClick={() => { onLayoutSelected('TB'); setShowSelectionMenu(false); }}
                                                    disabled={!hasSelection}
                                                    className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                                >
                                                    <ArrowDown size={12} /> 下
                                                </button>
                                                <button
                                                    onClick={() => { onLayoutSelected('BT'); setShowSelectionMenu(false); }}
                                                    disabled={!hasSelection}
                                                    className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                                >
                                                    <ArrowUp size={12} /> 上
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 my-auto mx-1" />
                    </>
                )}

                {/* 历史记录操作组 */}
                {onUndo && (
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="撤销"
                    >
                        <Undo size={18} />
                    </button>
                )}
                {onRedo && (
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="重做"
                    >
                        <Redo size={18} />
                    </button>
                )}
                
                {(onUndo || onRedo) && <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 my-auto mx-1" />}

                {/* 缩放与自适应操作组 */}
                <button
                    onClick={() => zoomIn()}
                    className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                    title="放大"
                >
                    <Plus size={18} />
                </button>
                <button
                    onClick={() => zoomOut()}
                    className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                    title="缩小"
                >
                    <Minus size={18} />
                </button>
                <button
                    onClick={() => fitView()}
                    className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                    title="适应屏幕"
                >
                    <Maximize size={18} />
                </button>

                {/* 视图锁定切换按钮 */}
                <button
                    onClick={toggleLock}
                    className={cn(
                        "p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
                        isLocked ? "text-red-500 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    )}
                    title={isLocked ? "解锁视图" : "锁定视图"}
                >
                    {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
                </button>
            </div>
        </div>
    );
}
