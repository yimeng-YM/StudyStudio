import { memo } from 'react';
import {
  TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

/**
 * KPI / 统计卡片：用于在笔记中展示关键数据指标。
 * AI 可通过 Markdown 中的 ```kpi 代码块输出一组卡片。
 */

export interface KpiItem {
  /** 标题（如"本周学习时长"） */
  label: string;
  /** 数值（如 "12.5h" 或 85） */
  value: string | number;
  /** 单位（如 "小时"、"%"） */
  unit?: string;
  /** 变化趋势 */
  trend?: 'up' | 'down' | 'flat';
  /** 变化幅度描述（如 "+12%"） */
  trendLabel?: string;
  /** 副标题 / 描述 */
  description?: string;
  /** 强调色：默认自动匹配趋势色 */
  accent?: 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'default';
}

const ACCENT_MAP: Record<string, { bg: string; text: string; border: string; trendUp: string; trendDown: string }> = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-950/40',    text: 'text-blue-700 dark:text-blue-300',    border: 'border-blue-200 dark:border-blue-800',    trendUp: 'text-emerald-500', trendDown: 'text-red-500' },
  green:   { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', trendUp: 'text-emerald-500', trendDown: 'text-red-500' },
  red:     { bg: 'bg-red-50 dark:bg-red-950/40',        text: 'text-red-700 dark:text-red-300',        border: 'border-red-200 dark:border-red-800',        trendUp: 'text-emerald-500', trendDown: 'text-red-500' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-950/40',   text: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-200 dark:border-amber-800',   trendUp: 'text-emerald-500', trendDown: 'text-red-500' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800', trendUp: 'text-emerald-500', trendDown: 'text-red-500' },
  default: { bg: 'bg-zinc-50 dark:bg-zinc-800/60',     text: 'text-zinc-700 dark:text-zinc-300',     border: 'border-zinc-200 dark:border-zinc-700',     trendUp: 'text-emerald-500', trendDown: 'text-red-500' },
};

/** 单个 KPI 磁贴 */
export const KpiTile = memo(function KpiTile({ item }: { item: KpiItem }) {
  const accentKey = item.accent || 'default';
  const accent = ACCENT_MAP[accentKey] || ACCENT_MAP.default;

  const trendIcon = item.trend === 'up'
    ? <TrendingUp size={14} className={`shrink-0 ${accent.trendUp}`} />
    : item.trend === 'down'
      ? <TrendingDown size={14} className={`shrink-0 ${accent.trendDown}`} />
      : <Minus size={14} className="shrink-0 text-zinc-400 dark:text-zinc-500" />;

  const trendArrow = item.trend === 'up'
    ? <ArrowUpRight size={12} className={`inline ${accent.trendUp}`} />
    : item.trend === 'down'
      ? <ArrowDownRight size={12} className={`inline ${accent.trendDown}`} />
      : null;

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1.5 min-w-[140px] ${accent.bg} ${accent.border}`}>
      {/* label */}
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">{item.label}</span>

      {/* value + unit */}
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold tracking-tight ${accent.text}`}>
          {item.value}
        </span>
        {item.unit && (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">{item.unit}</span>
        )}
      </div>

      {/* trend + description */}
      <div className="flex items-center gap-1.5 text-xs">
        {item.trend && (
          <span className="flex items-center gap-0.5">
            {trendIcon}
            {item.trendLabel && (
              <span className={item.trend === 'up' ? accent.trendUp : item.trend === 'down' ? accent.trendDown : 'text-zinc-400'}>
                {trendArrow}{item.trendLabel}
              </span>
            )}
          </span>
        )}
        {item.description && (
          <span className="text-zinc-400 dark:text-zinc-500 truncate">{item.description}</span>
        )}
      </div>
    </div>
  );
});

/** 多卡片网格布局 */
export const KpiGrid = memo(function KpiGrid({ items, cols = 3 }: { items: KpiItem[]; cols?: number }) {
  if (!items || items.length === 0) return null;

  const gridCols = cols === 1 ? 'grid-cols-1' :
    cols === 2 ? 'grid-cols-1 sm:grid-cols-2' :
    cols === 4 ? 'grid-cols-2 lg:grid-cols-4' :
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className={`grid ${gridCols} gap-3 my-4`}>
      {items.map((item, i) => (
        <KpiTile key={i} item={item} />
      ))}
    </div>
  );
});

export default KpiGrid;
