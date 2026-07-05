import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, Check, Zap, Brain, Microscope } from 'lucide-react';

/**
 * Agent 模式快速切换器（位于输入栏下方，与发送按钮并排）。
 * 以紧凑 pill 展示当前模式（快速执行 / 深度规划 / 深度研究），点击向上展开列表选择。
 *
 * 定位说明：popover 向上展开。
 * - align='left'（默认）：靠左对齐触发 pill、向右展开，适合 pill 位于左侧的场景（避免向左越过窗口左边界被裁切）。
 * - align='right'：靠右对齐触发 pill、向左展开，适合 pill 位于右下角等右侧场景（避免向右越过窗口右边界被裁切）。
 */
type AgentMode = 'act' | 'plan' | 'research';

interface ModeSwitcherProps {
  mode: AgentMode;
  onChange: (mode: AgentMode) => void;
  /** popover 水平对齐方式：'left' 向右展开 / 'right' 向左展开，默认 'left' */
  align?: 'left' | 'right';
}

const MODES: { key: AgentMode; label: string; desc: string; Icon: typeof Zap }[] = [
  { key: 'act', label: '快速执行', desc: '直接响应请求，快速执行操作', Icon: Zap },
  { key: 'plan', label: '深度规划', desc: '先思考规划，再逐步执行复杂任务', Icon: Brain },
  { key: 'research', label: '深度研究', desc: '多阶段数据采集与分析，论文级深度报告', Icon: Microscope },
];

/** 各模式的视觉风格 token */
const MODE_STYLE: Record<AgentMode, { pill: string; icon: string; active: string; badge: string }> = {
  act: {
    pill: "bg-white/80 dark:bg-zinc-800/80 border-zinc-200/70 dark:border-zinc-700/70 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600",
    icon: "text-primary",
    active: "text-primary",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
  plan: {
    pill: "bg-indigo-50/80 dark:bg-indigo-900/20 border-indigo-200/70 dark:border-indigo-700/50 text-indigo-600 dark:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-600",
    icon: "text-indigo-500",
    active: "text-indigo-600 dark:text-indigo-400",
    badge: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  research: {
    pill: "bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-200/70 dark:border-emerald-700/50 text-emerald-600 dark:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-600",
    icon: "text-emerald-500",
    active: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
};

export function ModeSwitcher({ mode, onChange, align = 'left' }: ModeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = MODES.find(m => m.key === mode) || MODES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* 触发 pill */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors shadow-sm backdrop-blur-md",
          MODE_STYLE[mode].pill
        )}
        title="切换 Agent 模式"
      >
        <current.Icon size={12} className={cn("shrink-0", MODE_STYLE[mode].icon)} />
        <span>{current.label}</span>
        <ChevronUp size={12} className={cn("shrink-0 transition-transform", !open && "rotate-180")} />
      </button>

      {/* popover：向上展开，水平方向按 align 靠左/靠右对齐触发 pill */}
      {open && (
        <div className={cn(
          "absolute bottom-full mb-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150",
          align === 'right' ? "right-0" : "left-0"
        )}>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 bg-zinc-50/50 dark:bg-zinc-800/30">
            Agent 模式
          </div>
          {MODES.map(m => {
            const active = m.key === mode;
            return (
              <div
                key={m.key}
                onClick={() => { onChange(m.key); setOpen(false); }}
                className={cn(
                  "px-3 py-2 cursor-pointer flex items-start gap-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                  active && MODE_STYLE[m.key].active
                )}
              >
                <m.Icon size={14} className="shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.label}</span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{m.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}