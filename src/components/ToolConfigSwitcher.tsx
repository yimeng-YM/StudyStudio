import { useState, useRef, useEffect } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { cn } from '@/lib/utils';
import { ChevronUp, Wrench, Globe, BookOpen } from 'lucide-react';
import {
  isSearchBackendConfigured,
  isWebUsable,
  isWikipediaOn,
} from '@/lib/toolConfig';

/**
 * AI 对话界面的「工具配置」按钮（与 ModeSwitcher / ModelSwitcher 并排）。
 * 点击向上展开 popover，提供联网工具开关，遵循联动规则（见 toolConfig.ts）：
 *   - 「联网搜索 + 网页读取」总开关：同步控制 web_search 与 read_url。Local 免 Key；第三方后端需对应 Key。
 *   - 维基百科站内搜（search_wikipedia_web）**无独立开关——总开关开启即自带**该能力（国内可用）。
 *   - 维基百科原站 API（search_wikipedia）：独立开关，**默认关闭**（被墙，挂 VPN 可开），总开关关时联动关闭。
 * 切换即时写入运行时 config，下一条消息即生效（Agent 循环按可用性注入工具）。
 */
export function ToolConfigSwitcher() {
  const config = useAIStore(s => s.config);
  const updateConfig = useAIStore(s => s.updateConfig);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const backendConfigured = isSearchBackendConfigured(config ?? null);
  const webUsable = isWebUsable(config ?? null);
  const wikiOn = isWikipediaOn(config ?? null);
  const anyOn = webUsable || wikiOn;

  // 总开关关闭（或不可用）时，原站百科开关联动禁用
  const encDisabled = !webUsable;

  return (
    <div ref={ref} className="relative">
      {/* 触发 pill */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors shadow-sm backdrop-blur-md",
          anyOn
            ? "bg-blue-50/80 dark:bg-blue-900/20 border-blue-200/70 dark:border-blue-700/50 text-blue-600 dark:text-blue-400 hover:border-blue-300 dark:hover:border-blue-600"
            : "bg-white/80 dark:bg-zinc-800/80 border-zinc-200/70 dark:border-zinc-700/70 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600"
        )}
        title="工具配置"
      >
        <Wrench size={12} className={cn("shrink-0", anyOn ? "text-blue-500" : "text-zinc-400")} />
        <span>工具</span>
        <ChevronUp size={12} className={cn("shrink-0 transition-transform", !open && "rotate-180")} />
      </button>

      {/* popover：向上、向右展开。overflow-visible 以便禁用态悬停提示可越界显示 */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-visible z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 bg-zinc-50/50 dark:bg-zinc-800/30 rounded-t-xl">
            联网工具
          </div>

          {/* 总开关：联网搜索 + 网页读取 */}
          <ToolToggleRow
            icon={<Globe size={14} className="shrink-0 mt-0.5 text-blue-500" />}
            label="联网搜索 + 网页读取"
            description="搜索网络 + 读取网页正文"
            checked={webUsable}
            disabled={!backendConfigured}
            disabledHint="请先在 设置 → 高级参数 中完成搜索后端配置"
            onChange={(v) => updateConfig({ webSearchEnabled: v })}
          />

          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 bg-zinc-50/50 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800">
            权威百科来源
          </div>

          {/* 维基百科原站 API（默认关闭，被墙） */}
          <ToolToggleRow
            icon={<BookOpen size={14} className="shrink-0 mt-0.5 text-emerald-500" />}
            label="维基百科"
            description="原站 API（默认关闭，需 VPN 可达）"
            checked={wikiOn}
            disabled={encDisabled}
            disabledHint="请先开启上方「联网搜索 + 网页读取」"
            onChange={(v) => updateConfig({ wikipediaEnabled: v })}
          />

          <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-400 leading-snug">
            推荐本地部署使用 Local；仅使用网页版本时可选择 Serper/Jina
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 单个工具开关行：左侧图标 + 标签/描述，右侧 iOS 风格 toggle。
 * disabled 时整行灰色不可点，并在悬停时弹出引导提示。
 */
interface ToolToggleRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onChange: (v: boolean) => void;
}

function ToolToggleRow({ icon, label, description, checked, disabled, disabledHint, onChange }: ToolToggleRowProps) {
  return (
    <div
      className={cn(
        "group relative px-3 py-2 flex items-start gap-2 text-xs transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
      )}
      onClick={() => !disabled && onChange(!checked)}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-zinc-700 dark:text-zinc-200">{label}</div>
        <div className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!checked); }}
        className={cn(
          "relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5",
          checked ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700",
          disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
        )}
      >
        <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", checked && "translate-x-4")} />
      </button>

      {/* 禁用态悬停提示：向上越界显示，引导用户前往设置配置 Key / 代理 */}
      {disabled && disabledHint && (
        <div className="absolute bottom-full left-2 mb-1 px-2 py-1 rounded-md bg-zinc-800 dark:bg-zinc-700 text-white text-[10px] leading-snug w-48 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
          {disabledHint}
        </div>
      )}
    </div>
  );
}
