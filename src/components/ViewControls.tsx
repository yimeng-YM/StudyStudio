import { useReactFlow } from 'reactflow';
import { Plus, Minus, Maximize, Lock, Unlock, Undo, Redo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/**
 * 视图控制按钮组件属性
 */
interface ViewControlsProps {
    className?: string; // 额外的样式类
    onUndo?: () => void; // 撤销回调
    onRedo?: () => void; // 重做回调
    canUndo?: boolean;   // 是否可撤销
    canRedo?: boolean;   // 是否可重做
}

/**
 * 画布视图控制组件
 * 
 * 为 React Flow 提供常用的画布操作控件。
 * 包含：
 * 1. 缩放控制：放大、缩小、自适应视图。
 * 2. 状态控制：撤销与重做（如果父组件提供了对应的处理逻辑）。
 * 3. 锁定模式：切换画布的锁定状态。开启后，所有节点将不可拖拽、不可选择，防止意外修改。
 */
export function ViewControls({ className, onUndo, onRedo, canUndo, canRedo }: ViewControlsProps) {
    const { zoomIn, zoomOut, fitView, getNodes, setNodes } = useReactFlow();
    const [isLocked, setIsLocked] = useState(false);

    /**
     * 切换画布锁定状态
     * 遍历当前所有节点并更新其 draggable 和 selectable 属性
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
        <div className={cn("flex gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 shadow-lg z-50", className)}>
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
    );
}
