import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentSliderProps {
  /** 预设档位数组（升序） */
  options: readonly number[];
  /** 当前选中值 */
  value: number;
  /** 值变更回调 */
  onChange: (v: number) => void;
  /** 头部标签 */
  label?: string;
  /** 标签下方的补充说明 */
  description?: string;
  /** 右上角当前值的格式化显示；缺省为 `${value}${unit}` */
  formatValue?: (v: number) => string;
  /** 是否在每个节点下方显示其取值（如字号 11/12/...） */
  showValueLabels?: boolean;
  /** 左端语义标签（如温度的"精准"） */
  startLabel?: string;
  /** 右端语义标签（如温度的"创意"） */
  endLabel?: string;
  /** 主题色 */
  accent?: 'blue' | 'amber';
  /** formatValue 缺省时拼接的单位 */
  unit?: string;
}

/** 主题色映射：填充、选中点、已过点、标签、徽章、聚焦环 */
const ACCENT = {
  blue: {
    fill: 'bg-blue-500/40 dark:bg-blue-400/30',
    dotSelected: 'bg-blue-500 dark:bg-blue-400',
    dotPast: 'bg-blue-400/70 dark:bg-blue-400/60',
    labelSelected: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    ring: 'focus-visible:ring-blue-500',
  },
  amber: {
    fill: 'bg-amber-500/40 dark:bg-amber-400/30',
    dotSelected: 'bg-amber-500 dark:bg-amber-400',
    dotPast: 'bg-amber-400/70 dark:bg-amber-400/60',
    labelSelected: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    ring: 'focus-visible:ring-amber-500',
  },
} as const;

/** 在档位数组中找到最接近 target 的索引（用于容错非网格值，如旧数据 temperature=0.7） */
function nearestIndex(target: number, opts: readonly number[]): number {
  let best = 0;
  let bestDist = Math.abs(opts[0] - target);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(opts[i] - target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * 通用分段滑块：长胶囊轨道 + 实心小灰点刻度。
 *
 * - 胶囊铺满整个滑块宽度，首尾节点贴齐胶囊两端（不外溢）；
 * - 沿轨道拖拽（鼠标 / 触屏）时实时跟随并在松手时吸附到最近档位；
 * - 点击轨道空白区域吸附到最近节点，点击节点直接选中；
 * - 支持键盘导航（←→↑↓ / Home / End）与 ARIA 无障碍属性；
 * - 两端语义标签左 / 右对齐到胶囊边缘，确保不被父级 `overflow-hidden` 裁切。
 */
export function SegmentSlider({
  options,
  value,
  onChange,
  label,
  description,
  formatValue,
  showValueLabels,
  startLabel,
  endLabel,
  accent = 'blue',
  unit = '',
}: SegmentSliderProps) {
  const valueIndex = options.indexOf(value);
  // 容错：value 不在档位上时吸附到最近档位，保证点位置与徽章展示一致
  const selectedIndex = valueIndex !== -1 ? valueIndex : nearestIndex(value, options);
  const snappedValue = options[selectedIndex];
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const a = ACCENT[accent];
  const lastIdx = options.length - 1;
  const hasLabels = Boolean(startLabel || endLabel || showValueLabels);

  const displayValue = formatValue ? formatValue(snappedValue) : `${snappedValue}${unit}`;

  /** 根据 clientX 计算最近节点并触发 onChange */
  const snapToClientX = useCallback(
    (clientX: number) => {
      if (!trackRef.current || options.length < 2) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const clampedIndex = Math.round(ratio * (options.length - 1));
      const safeIndex = Math.max(0, Math.min(options.length - 1, clampedIndex));
      onChange(options[safeIndex]);
    },
    [options, onChange],
  );

  // 用 ref 持有最新的 snap 函数，使拖拽监听只在 dragging 切换时挂载/卸载一次。
  // 否则当 onChange 为内联函数（每次渲染新引用）时，snapToClientX 引用反复变化，
  // 会导致 useEffect 反复重订阅 window 监听，拖拽过程中失效。
  const snapRef = useRef(snapToClientX);
  snapRef.current = snapToClientX;

  // ── 鼠标拖拽：按下即吸附，移动跟随，松手结束 ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    snapRef.current(e.clientX);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      snapRef.current(e.clientX);
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  // ── 触屏拖拽 ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setDragging(true);
    snapRef.current(e.touches[0].clientX);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      snapRef.current(e.touches[0].clientX);
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
  }, [dragging]);

  // ── 键盘导航 ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next = selectedIndex;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        next = Math.max(0, selectedIndex - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        next = Math.min(options.length - 1, selectedIndex + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        next = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        next = options.length - 1;
      }
      if (next !== selectedIndex) onChange(options[next]);
    },
    [selectedIndex, options, onChange],
  );

  // 节点不单独拦截鼠标/触屏事件——整条轨道（含圆点）统一由上方 handleMouseDown /
  // handleTouchStart 处理"按下即吸附 + 拖拽跟随"，避免从圆点上按下时拖拽被拦截。

  const fillPercent = options.length > 1 ? (selectedIndex / lastIdx) * 100 : 100;

  /** 计算某节点下方应显示的文字 */
  const nodeText = (idx: number): string | undefined => {
    if (idx === 0 && startLabel) return startLabel;
    if (idx === lastIdx && endLabel) return endLabel;
    return showValueLabels ? String(options[idx]) : undefined;
  };

  return (
    <div className="space-y-2.5">
      {/* 头部：标签 + 当前值徽章 */}
      {(label || description) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {label && (
              <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {label}
              </span>
            )}
            {description && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                {description}
              </p>
            )}
          </div>
          <span
            className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-md tabular-nums min-w-[3rem] text-center shrink-0',
              a.badge,
            )}
          >
            {displayValue}
          </span>
        </div>
      )}

      {/* 轨道：胶囊铺满整个宽度，首尾节点贴齐两端 */}
      <div
        ref={trackRef}
        className={cn(
          'relative select-none cursor-grab active:cursor-grabbing touch-none rounded-lg outline-none',
          'focus-visible:ring-2 focus-visible:ring-offset-2',
          a.ring,
          hasLabels ? 'h-9' : 'h-6',
        )}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onKeyDown={handleKeyDown}
        role="radiogroup"
        aria-label={label}
        aria-orientation="horizontal"
        tabIndex={0}
      >
        {/* 长胶囊轨道背景 + 填充 */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className={cn(
              'absolute left-0 top-0 h-full rounded-full',
              a.fill,
              dragging ? 'duration-0' : 'transition-all duration-200',
            )}
            style={{ width: `${fillPercent}%` }}
          />
        </div>

        {/* 刻度节点：实心小灰点，首尾贴齐胶囊两端 */}
        {options.map((opt, idx) => {
          const leftPercent = options.length > 1 ? (idx / lastIdx) * 100 : 50;
          const isSelected = idx === selectedIndex;
          const isPast = idx < selectedIndex;
          const text = nodeText(idx);
          const nodeDisplay = formatValue ? formatValue(opt) : `${opt}${unit}`;
          // 首节点左缘贴左端、尾节点右缘贴右端、中间居中——保证胶囊宽度即节点跨度
          const tx = idx === 0 ? '0%' : idx === lastIdx ? '-100%' : '-50%';
          // 文案水平对齐：两端外贴边（避免被 overflow 裁切），中间居中
          const labelX =
            idx === 0
              ? 'left-0'
              : idx === lastIdx
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2';

          return (
            <button
              key={opt}
              type="button"
              className={cn(
                'absolute flex flex-col items-center pointer-events-none outline-none rounded-full',
              )}
              style={{ left: `${leftPercent}%`, top: '50%', transform: `translate(${tx}, -50%)` }}
              role="radio"
              aria-checked={isSelected}
              aria-label={nodeDisplay}
              tabIndex={-1}
              title={nodeDisplay}
            >
              {/* 实心小圆点（无描边环） */}
              <div
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-200',
                  isSelected
                    ? cn('scale-[1.4]', a.dotSelected)
                    : isPast
                      ? a.dotPast
                      : 'bg-zinc-400 dark:bg-zinc-500',
                )}
              />
              {text && (
                <span
                  className={cn(
                    'absolute top-full mt-1 text-[10px] leading-none whitespace-nowrap transition-colors duration-200',
                    'pointer-events-none select-none',
                    labelX,
                    isSelected
                      ? cn('font-semibold', a.labelSelected)
                      : 'text-zinc-400 dark:text-zinc-500',
                  )}
                >
                  {text}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
