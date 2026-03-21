import { cn } from '@/lib/utils';

/**
 * 调整大小手柄组件属性
 */
interface ResizeHandleProps {
    onMouseDown: (e: React.MouseEvent) => void; // 鼠标按下事件回调，用于启动拖拽逻辑
    className?: string; // 额外的样式类
    orientation?: 'vertical' | 'horizontal'; // 手柄方向（目前主要实现为垂直方向）
}

/**
 * 通用调整大小手柄组件
 * 
 * 用于侧边栏、分栏等需要通过拖拽调整宽度的场景。
 * 核心逻辑：
 * 1. 交互响应：通过 onMouseDown 钩入父组件提供的拖拽处理逻辑。
 * 2. 视觉反馈：在鼠标悬浮（hover）或激活（active）时，通过 CSS 变化（宽度增加、颜色变蓝）提供即时的交互反馈。
 * 3. 兼容性：支持 touch-none 和 select-none 属性，确保在移动端和快速拖动时体验流畅。
 */
export function ResizeHandle({ onMouseDown, className }: ResizeHandleProps) {
    return (
        <div
            onMouseDown={onMouseDown}
            className={cn(
                "w-1 hover:w-1.5 active:w-1.5 cursor-col-resize bg-transparent hover:bg-blue-400 active:bg-blue-600 transition-all z-20 flex flex-col justify-center items-center group touch-none select-none",
                className
            )}
        >
            {/* 视觉上的中线，hover 时隐藏以显示背景色 */}
            <div className="w-0.5 h-full bg-slate-200 dark:bg-slate-800 group-hover:bg-transparent" />
        </div>
    );
}
