import { useState, useRef, useEffect, useMemo } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { cn } from '@/lib/utils';
import { ChevronUp, Check, Search, Cpu, Server, AlertCircle } from 'lucide-react';

/**
 * 对话右下角快速切换器。
 * 以紧凑 pill 展示「当前供应商 · 模型」，点击弹出 popover：
 * - 顶部可手输/搜索模型名，回车即设为当前模型；
 * - 供应商列表，点供应商切换为当前，并在其下方展开模型清单供选择。
 * 切换即时写入运行时 config，下一条消息即生效。
 */
export function ModelSwitcher() {
  const providers = useAIStore(s => s.providers);
  const config = useAIStore(s => s.config);
  const settings = useAIStore(s => s.settings);
  const setActiveProvider = useAIStore(s => s.setActiveProvider);
  const updateConfig = useAIStore(s => s.updateConfig);

  const [open, setOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeProvider = useMemo(
    () => providers.find(p => p.id === config?.activeProviderId) || null,
    [providers, config]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);
  useEffect(() => { if (!open) setModelSearch(''); }, [open]);

  const filteredModels = useMemo(() => {
    const list = activeProvider?.modelList || [];
    if (!modelSearch) return list;
    return list.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()));
  }, [activeProvider, modelSearch]);

  const selectModel = (m: string) => {
    updateConfig({ model: m });
    setOpen(false);
  };

  const selectProvider = (id: string) => {
    setActiveProvider(id);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const v = modelSearch.trim();
      if (v) selectModel(v);
    }
  };

  const ready = !!settings && !!activeProvider;

  return (
    <div ref={containerRef} className="relative">
      {/* 触发 pill */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 max-w-[280px] px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors shadow-sm",
          ready
            ? "bg-white/80 dark:bg-zinc-800/80 border-zinc-200/70 dark:border-zinc-700/70 text-zinc-600 dark:text-zinc-300 backdrop-blur-md hover:border-zinc-300 dark:hover:border-zinc-600"
            : "bg-amber-50/80 dark:bg-amber-900/20 border-amber-300/60 dark:border-amber-700/50 text-amber-600 dark:text-amber-400 backdrop-blur-md"
        )}
        title="切换供应商与模型"
      >
        {ready ? (
          <>
            <Server size={12} className="shrink-0 text-blue-500" />
            <span className="truncate max-w-[120px]">{activeProvider?.name}</span>
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            <Cpu size={12} className="shrink-0 text-zinc-400" />
            <span className="truncate max-w-[120px]">{config?.model || '未选模型'}</span>
          </>
        ) : (
          <>
            <AlertCircle size={12} className="shrink-0" />
            <span>{providers.length === 0 ? '未配置供应商' : '未选模型'}</span>
          </>
        )}
        <ChevronUp size={12} className={cn("shrink-0 transition-transform", !open && "rotate-180")} />
      </button>

      {/* popover：向上展开 */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* 手输/搜索模型 */}
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                ref={inputRef}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                placeholder="搜索模型，或输入后回车..."
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}
                onKeyDown={onSearchKeyDown}
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {/* 当前供应商的模型清单（可筛选） */}
            {activeProvider && (
              <div className="border-b border-zinc-100 dark:border-zinc-800">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 bg-zinc-50/50 dark:bg-zinc-800/30">
                  当前供应商 · {activeProvider.name}
                </div>
                {filteredModels.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-zinc-400">
                    {activeProvider.modelList?.length ? '未找到匹配模型' : '该供应商暂无模型清单，请在上方输入框输入模型名'}
                  </div>
                ) : filteredModels.map(m => (
                  <div
                    key={m}
                    onClick={() => selectModel(m)}
                    className={cn(
                      "px-3 py-1.5 cursor-pointer flex items-center justify-between text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                      config?.model === m && "text-blue-600 dark:text-blue-400 font-medium"
                    )}
                  >
                    <span className="truncate">{m}</span>
                    {config?.model === m && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </div>
                ))}
              </div>
            )}

            {/* 供应商列表 */}
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 bg-zinc-50/50 dark:bg-zinc-800/30">
                切换供应商
              </div>
              {providers.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-zinc-400">请先在设置中添加供应商</div>
              )}
              {providers.map(p => {
                const isActive = p.id === config?.activeProviderId;
                return (
                  <div
                    key={p.id}
                    onClick={() => selectProvider(p.id)}
                    className={cn(
                      "px-3 py-2 cursor-pointer flex items-center justify-between text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                      isActive && "text-blue-600 dark:text-blue-400 font-medium"
                    )}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Server size={12} className="shrink-0 opacity-60" />
                      <span className="truncate">{p.name}</span>
                      <span className="text-[10px] text-zinc-400 font-normal">{p.modelList?.length || 0}</span>
                    </span>
                    {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}