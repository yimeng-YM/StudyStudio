import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface FontSizeSliderProps {
  label: string;
  description?: string;
  options: readonly number[];
  value: number;
  onChange: (value: number) => void;
  unit?: string;
}

/**
 * 宽轨道 + 小节点字体大小滑块
 *
 * 用户可沿轨道拖拽（鼠标 / 触屏）在预设档位之间滑动，
 * 点击轨道空白区域吸附到最近节点，点击节点直接选中。
 * 支持键盘导航与 ARIA 无障碍属性。
 *
 * @param label        - 滑块标签
 * @param description  - 补充说明（可选）
 * @param options      - 预设字号数组
 * @param value        - 当前选中值
 * @param onChange     - 值变更回调
 * @param unit         - 单位显示，默认 "px"
 */
export function FontSizeSlider({
  label,
  description,
  options,
  value,
  onChange,
  unit = 'px',
}: FontSizeSliderProps) {
  const selectedIndex = options.indexOf(value);
  const trackRef = useRef<HTMLDivElement>(null);

  const [dragging, setDragging] = useState(false);

  /** 根据 clientX 计算最近节点并触发 onChange */
  const snapToClientX = useCallback(
    (clientX: number) => {
      if (!trackRef.current || options.length < 2) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const clampedIndex = Math.round(ratio * (options.length - 1));
      // 边界保护：确保索引在有效范围内
      const safeIndex = Math.max(0, Math.min(options.length - 1, clampedIndex));
      onChange(options[safeIndex]);
    },
    [options, onChange],
  );

  // ── 鼠标拖拽（仅在轨道空白区域按下时触发，节点按钮会阻止冒泡）──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 只响应主按钮（左键）
      if (e.button !== 0) return;
      e.preventDefault();
      setDragging(true);
      snapToClientX(e.clientX);
    },
    [snapToClientX],
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      snapToClientX(e.clientX);
    };
    const handleMouseUp = () => setDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, snapToClientX]);

  // ── 触屏拖拽 ──
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // 节点按钮阻止 touch 冒泡，此处仅轨道空白区域触发
      e.preventDefault();
      setDragging(true);
      snapToClientX(e.touches[0].clientX);
    },
    [snapToClientX],
  );

  useEffect(() => {
    if (!dragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      snapToClientX(e.touches[0].clientX);
    };
    const handleTouchEnd = () => setDragging(false);

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [dragging, snapToClientX]);

  // ── 键盘导航（仅轨道容器处理，节点按钮不处理键盘）──
  const handleTrackKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let nextIndex = selectedIndex;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = Math.max(0, selectedIndex - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = Math.min(options.length - 1, selectedIndex + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = options.length - 1;
      }
      if (nextIndex !== selectedIndex) {
        onChange(options[nextIndex]);
      }
    },
    [selectedIndex, options, onChange],
  );

  // ── 节点点击（阻止冒泡，避免触发轨道的 mousedown）──
  const handleNodeClick = useCallback(
    (e: React.MouseEvent, opt: number) => {
      e.stopPropagation();
      e.preventDefault();
      onChange(opt);
    },
    [onChange],
  );

  // 阻止节点上的 mousedown/touchstart 冒泡，避免启动拖拽
  const stopPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const fillPercent =
    options.length > 1 ? (selectedIndex / (options.length - 1)) * 100 : 100;

  return (
    <div className="space-y-2.5">
      {/* 头部：标签 + 当前值 */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {label}
          </span>
          {description && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              {description}
            </p>
          )}
        </div>
        <span className="text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-md tabular-nums min-w-[3rem] text-center">
          {value}{unit}
        </span>
      </div>

      {/* 滑块轨道 */}
      <div
        ref={trackRef}
        className="relative h-12 select-none cursor-pointer touch-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onKeyDown={handleTrackKeyDown}
        role="radiogroup"
        aria-label={label}
        aria-orientation="horizontal"
        tabIndex={0}
      >
        {/* 宽轨道背景 + 填充 */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className={cn(
              'absolute left-0 top-0 h-full rounded-full',
              'bg-blue-500/40 dark:bg-blue-400/30',
              dragging ? 'duration-0' : 'transition-all duration-200',
            )}
            style={{ width: `${fillPercent}%` }}
          />
        </div>

        {/* 刻度节点（精确定位于百分比，阻止事件冒泡） */}
        {options.map((opt, idx) => {
          const leftPercent =
            options.length > 1 ? (idx / (options.length - 1)) * 100 : 50;
          const isSelected = idx === selectedIndex;
          const isPast = idx < selectedIndex;

          return (
            <button
              key={opt}
              type="button"
              onClick={(e) => handleNodeClick(e, opt)}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              className={cn(
                'absolute top-1/2 -translate-x-1/2 -translate-y-1/2',
                'flex flex-col items-center group',
                'outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-full',
              )}
              style={{ left: `${leftPercent}%` }}
              role="radio"
              aria-checked={isSelected}
              aria-label={`${opt}${unit}`}
              tabIndex={-1}
              title={`${opt}${unit}`}
            >
              {/* 小圆点 */}
              <div
                className={cn(
                  'w-2.5 h-2.5 rounded-full transition-all duration-200',
                  'ring-2 ring-white dark:ring-zinc-900',
                  isSelected
                    ? 'bg-blue-500 dark:bg-blue-400 scale-125 shadow-sm shadow-blue-500/25'
                    : isPast
                      ? 'bg-blue-400/50 dark:bg-blue-400/40'
                      : 'bg-zinc-300 dark:bg-zinc-600 group-hover:bg-blue-400/60',
                )}
              />
              {/* 刻度标签 */}
              <span
                className={cn(
                  'absolute top-3.5 text-[10px] leading-none whitespace-nowrap transition-colors duration-200',
                  'pointer-events-none select-none',
                  isSelected
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-500 dark:group-hover:text-zinc-400',
                )}
              >
                {opt}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
