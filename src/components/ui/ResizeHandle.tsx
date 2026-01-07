import { cn } from '@/lib/utils';

interface ResizeHandleProps {
    onMouseDown: (e: React.MouseEvent) => void;
    className?: string;
    orientation?: 'vertical' | 'horizontal';
}

export function ResizeHandle({ onMouseDown, className }: ResizeHandleProps) {
    return (
        <div
            onMouseDown={onMouseDown}
            className={cn(
                "w-1 hover:w-1.5 active:w-1.5 cursor-col-resize bg-transparent hover:bg-blue-400 active:bg-blue-600 transition-all z-20 flex flex-col justify-center items-center group touch-none select-none",
                className
            )}
        >
            <div className="w-0.5 h-full bg-slate-200 dark:bg-slate-800 group-hover:bg-transparent" />
        </div>
    );
}
