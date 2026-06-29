import { SortAsc, Clock, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortMode, SortDirection } from '@/hooks/useSorting';

interface SortControlsProps {
  sortMode: SortMode;
  sortDirection: SortDirection;
  onModeChange: (mode: SortMode) => void;
  onDirectionToggle: () => void;
  /** 控件尺寸：sm 用于侧边栏等紧凑位置，md 用于常规面板 */
  size?: 'sm' | 'md';
  /** 视觉变体：bordered 用于仪表盘，filled 用于模块内面板，minimal 用于侧边栏 */
  variant?: 'bordered' | 'filled' | 'minimal';
  className?: string;
}

/**
 * 共享排序控件组件
 * 提供统一的三个排序模式按钮 + 方向切换按钮。
 * 所有位置（Dashboard、Sidebar、NotesModule、QuizModule、MobileSubjects）共用此组件。
 */
export function SortControls({
  sortMode,
  sortDirection,
  onModeChange,
  onDirectionToggle,
  size = 'md',
  variant = 'bordered',
  className,
}: SortControlsProps) {
  const iconSize = size === 'sm' ? 12 : size === 'md' ? 14 : 16;
  const padding = size === 'sm' ? 'p-0.5' : 'p-1.5';

  // 根据 variant 决定容器样式
  const containerClass = variant === 'minimal'
    ? 'flex items-center gap-0.5'
    : variant === 'filled'
      ? 'flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg'
      : 'flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm';

  // 模式按钮激活态样式
  const activeClass = variant === 'minimal'
    ? 'text-primary bg-primary/10'
    : 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600';
  const inactiveClass = variant === 'minimal'
    ? 'text-muted-foreground hover:text-foreground'
    : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800';
  const buttonClass = `${padding} rounded transition-colors flex-1 flex justify-center`;
  const dirButtonClass = variant === 'minimal'
    ? `${padding} rounded text-muted-foreground hover:text-foreground`
    : `${padding} rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors`;

  // 分隔线（minimal 变体不显示）
  const separatorClass = variant === 'minimal'
    ? 'w-px h-3 bg-muted-foreground/20 mx-0.5'
    : 'w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1';

  return (
    <div className={cn(containerClass, className)}>
      <button
        onClick={() => onModeChange('name')}
        className={cn(buttonClass, sortMode === 'name' ? activeClass : inactiveClass)}
        title="按名称排序"
      >
        <SortAsc size={iconSize} />
      </button>
      <button
        onClick={() => onModeChange('lastAccessed')}
        className={cn(buttonClass, sortMode === 'lastAccessed' ? activeClass : inactiveClass)}
        title="按最近访问排序"
      >
        <Clock size={iconSize} />
      </button>
      <button
        onClick={() => onModeChange('manual')}
        className={cn(buttonClass, sortMode === 'manual' ? activeClass : inactiveClass)}
        title="手动排序"
      >
        <GripVertical size={iconSize} />
      </button>
      <div className={separatorClass} />
      <button
        onClick={onDirectionToggle}
        className={dirButtonClass}
        title={sortDirection === 'asc' ? '升序' : '降序'}
      >
        {sortDirection === 'asc' ? <ArrowUp size={iconSize} /> : <ArrowDown size={iconSize} />}
      </button>
    </div>
  );
}
