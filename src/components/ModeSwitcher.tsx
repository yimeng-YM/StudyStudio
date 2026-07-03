import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, Check, Zap, Brain } from 'lucide-react';

/**
 * Agent 模式快速切换器（位于输入栏上方，与 ModelSwitcher 并排）。
 * 以紧凑 pill 展示当前模式（快速执行 / 深度规划），点击向上展开列表选择。
 *
 * 定位说明：本组件 pill 位于 ModelSwitcher 左侧，列表采用 left-0 向右展开，
 * 并靠左对齐触发 pill —— 避免窄窗口下向左展开越过窗口左边界被 overflow-hidden 裁切。
 */
type AgentMode = 'act' | 'plan';

interface ModeSwitcherProps {
  mode: AgentMode;
  onChange: (mode: AgentMode) => void;
}

const MODES: { key: AgentMode; label: string; desc: string; Icon: typeof Zap }[] = [
  { key: 'act', label: '快速执行', desc: '直接响应请求，快速执行操作', Icon: Zap },
  { key: 'plan', label: '深度规划', desc: '先思考规划，再逐步执行复杂任务', Icon: Brain },
];

export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
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
          mode === 'plan'
            ? "bg-indigo-50/80 dark:bg-indigo-900/20 border-indigo-200/70 dark:border-indigo-700/50 text-indigo-600 dark:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-600"
            : "bg-white/80 dark:bg-zinc-800/80 border-zinc-200/70 dark:border-zinc-700/70 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600"
        )}
        title="切换 Agent 模式"
      >
        <current.Icon size={12} className={cn("shrink-0", mode === 'plan' ? "text-indigo-500" : "text-primary")} />
        <span>{current.label}</span>
        <ChevronUp size={12} className={cn("shrink-0 transition-transform", !open && "rotate-180")} />
      </button>

      {/* popover：向上、向右展开（靠左对齐触发 pill，避免窄窗口向左溢出被裁切） */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
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
                  active && (m.key === 'plan' ? "text-indigo-600 dark:text-indigo-400" : "text-primary")
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