import { useReactFlow } from 'reactflow';
import { Plus, Minus, Maximize, Lock, Unlock, Undo, Redo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface ViewControlsProps {
    className?: string;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}

export function ViewControls({ className, onUndo, onRedo, canUndo, canRedo }: ViewControlsProps) {
    const { zoomIn, zoomOut, fitView, getNodes, setNodes } = useReactFlow();
    const [isLocked, setIsLocked] = useState(false);

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
