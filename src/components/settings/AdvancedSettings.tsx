import { useState, useRef, useEffect, useMemo } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { SegmentSlider } from '@/components/ui/SegmentSlider';
import { DEFAULT_MAX_TOKENS } from '@/services/promptConfig';
import { cn } from '@/lib/utils';
import { Search, ChevronDown, Check, SlidersHorizontal, Tag, Globe } from 'lucide-react';

/**
 * 高级参数设置页。
 * 包含生成参数（Max Tokens、Temperature）以及「命名（会话标题）配置」——
 * 命名可使用独立于主对话的供应商与模型。所有变更即时持久化到运行时 config。
 */
export function AdvancedSettings() {
  const config = useAIStore(s => s.config);
  const providers = useAIStore(s => s.providers);
  const updateConfig = useAIStore(s => s.updateConfig);

  // 命名供应商下拉
  const [showNamingProvider, setShowNamingProvider] = useState(false);
  // 命名模型下拉
  const [showNamingModel, setShowNamingModel] = useState(false);
  const [namingModelSearch, setNamingModelSearch] = useState('');
  const namingModelRef = useRef<HTMLDivElement>(null);

  const activeProvider = useMemo(
    () => providers.find(p => p.id === config?.activeProviderId) || null,
    [providers, config]
  );
  const namingProvider = useMemo(() => {
    if (config?.namingProviderId) {
      const p = providers.find(x => x.id === config.namingProviderId);
      if (p) return p;
    }
    return activeProvider;
  }, [providers, config, activeProvider]);

  const usingMainForNaming = !config?.namingProviderId || namingProvider?.id === activeProvider?.id;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (namingModelRef.current && !namingModelRef.current.contains(e.target as Node)) {
        setShowNamingModel(false);
        setShowNamingProvider(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { if (!showNamingModel) setNamingModelSearch(''); }, [showNamingModel]);

  const filteredNamingModels = useMemo(() => {
    const list = namingProvider?.modelList || [];
    if (!namingModelSearch) return list;
    return list.filter(m => m.toLowerCase().includes(namingModelSearch.toLowerCase()));
  }, [namingProvider, namingModelSearch]);

  const selectNamingProvider = async (id: string | null) => {
    // 切换命名供应商时，若当前命名模型不在新供应商清单内则清空
    const target = id ? providers.find(p => p.id === id) : activeProvider;
    const patch: { namingProviderId?: string; namingModel?: string } = {};
    if (id) patch.namingProviderId = id;
    else patch.namingProviderId = undefined;
    if (config?.namingModel && target && !(target.modelList || []).includes(config.namingModel)) {
      patch.namingModel = '';
    }
    await updateConfig(patch);
    setShowNamingProvider(false);
  };

  const selectNamingModel = async (m: string) => {
    await updateConfig({ namingModel: m || undefined });
    setShowNamingModel(false);
  };

  const maxTokens = config?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const inputCls = "flex-1 border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow";

  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/80 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30">
          <SlidersHorizontal size={16} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">高级参数</h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">生成参数与命名模型配置</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Max Tokens */}
        <div>
          <label className="block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300">回复长度 (Max Tokens)</label>
          <div className="flex gap-2">
            <input
              type="number"
              className={inputCls}
              value={maxTokens}
              onChange={e => updateConfig({ maxTokens: parseInt(e.target.value) || 0 })}
              placeholder={String(DEFAULT_MAX_TOKENS)}
            />
            <button
              type="button"
              onClick={() => updateConfig({ maxTokens: DEFAULT_MAX_TOKENS })}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-colors whitespace-nowrap"
              title="重置为默认值"
            >
              默认
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[4096, 8192, DEFAULT_MAX_TOKENS, 16384, 32768].map(preset => {
              const active = maxTokens === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => updateConfig({ maxTokens: preset })}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[11px] font-medium tabular-nums border transition-colors',
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                  )}
                >
                  {preset >= 1024 ? `${(preset / 1024).toFixed(preset % 1024 === 0 ? 0 : 1)}K` : preset}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-zinc-400 mt-1.5">控制 AI 回复的最大长度，默认 {(DEFAULT_MAX_TOKENS / 1024).toFixed(0)}K，建议 4K - 32K</p>
        </div>

        {/* Temperature */}
        <SegmentSlider
          label="回复温度 (Temperature)"
          description="控制 AI 回复的随机性与创造性，0 为最精准，2 为最创意。"
          options={[0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]}
          value={config?.temperature ?? 0.7}
          onChange={(v) => updateConfig({ temperature: v })}
          accent="amber"
          startLabel="精准"
          endLabel="创意"
          formatValue={(v) => Number(v.toFixed(2)).toString()}
        />

        {/* 命名配置 */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <Tag size={15} className="text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">对话自动命名</h3>
          </div>
          <p className="text-[11px] text-zinc-400 -mt-2">为会话生成简短标题；可使用独立于主对话的供应商与模型（推荐更快速便宜的模型）</p>

          {/* 命名供应商 */}
          <div>
            <label className="block text-xs font-medium mb-1.5 text-zinc-600 dark:text-zinc-300">命名供应商</label>
            <div ref={namingModelRef} className="relative">
              <div
                className="flex items-center border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                onClick={() => setShowNamingProvider(!showNamingProvider)}
              >
                <span className={cn("flex-1 text-sm truncate", namingProvider ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400")}>
                  {namingProvider ? namingProvider.name : '选择供应商'}
                  {usingMainForNaming && <span className="text-zinc-400 text-xs">（同主供应商）</span>}
                </span>
                <ChevronDown className={cn("w-4 h-4 text-zinc-400 shrink-0 transition-transform", showNamingProvider && "rotate-180")} />
              </div>
              {showNamingProvider && (
                <div className="mt-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  <div
                    className={cn(
                      "px-3 py-2 cursor-pointer flex items-center justify-between text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                      usingMainForNaming && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    )}
                    onClick={() => selectNamingProvider(null)}
                  >
                    <span>使用主供应商</span>
                    {usingMainForNaming && <Check className="w-4 h-4 shrink-0" />}
                  </div>
                  {providers.map(p => {
                    const selected = config?.namingProviderId === p.id;
                    if (usingMainForNaming && p.id === activeProvider?.id) return null; // 已由「使用主供应商」覆盖
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "px-3 py-2 cursor-pointer flex items-center justify-between text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                          selected && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        )}
                        onClick={() => selectNamingProvider(p.id)}
                      >
                        <span className="truncate">{p.name}</span>
                        {selected && <Check className="w-4 h-4 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 命名模型 */}
          <div>
            <label className="block text-xs font-medium mb-1.5 text-zinc-600 dark:text-zinc-300">命名模型</label>
            <p className="text-[10px] text-zinc-400 mb-1.5">留空则使用主模型</p>
            <div className="relative">
              <div
                className="flex items-center border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                onClick={() => { setShowNamingModel(!showNamingModel); setNamingModelSearch(''); }}
              >
                <span className={cn("flex-1 text-sm truncate", config?.namingModel ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400")}>
                  {config?.namingModel || '使用主模型（留空）'}
                </span>
                <ChevronDown className={cn("w-4 h-4 text-zinc-400 shrink-0 transition-transform", showNamingModel && "rotate-180")} />
              </div>
              {showNamingModel && (
                <div className="mt-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm overflow-hidden">
                  <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                        placeholder="搜索模型，或输入后回车..."
                        value={namingModelSearch}
                        onChange={e => setNamingModelSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { const v = namingModelSearch.trim(); if (v) selectNamingModel(v); } }}
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-48">
                    <div
                      className={cn(
                        "px-3 py-2 cursor-pointer flex items-center justify-between text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                        !config?.namingModel && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      )}
                      onClick={() => selectNamingModel('')}
                    >
                      <span>使用主模型（留空）</span>
                      {!config?.namingModel && <Check className="w-4 h-4 shrink-0" />}
                    </div>
                    {filteredNamingModels.length === 0 ? (
                      <div className="p-3 text-center text-zinc-400 text-sm">
                        {namingProvider?.modelList?.length ? '未找到匹配的模型' : '该供应商暂无模型清单，可在上方输入框直接输入模型名'}
                      </div>
                    ) : filteredNamingModels.map(m => (
                      <div
                        key={m}
                        className={cn(
                          "px-3 py-2 cursor-pointer flex items-center justify-between text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                          config?.namingModel === m && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        )}
                        onClick={() => selectNamingModel(m)}
                      >
                        <span className="truncate">{m}</span>
                        {config?.namingModel === m && <Check className="w-4 h-4 shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 联网配置 */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-5 space-y-3">
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">联网（搜索 + 网页读取）</h3>
          </div>
          <p className="text-[11px] text-zinc-400 -mt-1">
            联网搜索与网页读取共用同一后端与同一 Key。不配置对应 Key 则无法启用联网能力。
          </p>

          {/* 搜索后端：Serper 前置（默认） */}
          <div>
            <label className="block text-xs font-medium mb-1.5 text-zinc-600 dark:text-zinc-300">后端</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => updateConfig({ webSearchBackend: 'serper' })} className={cn('flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors', (config?.webSearchBackend ?? 'serper') === 'serper' ? 'bg-blue-600 text-white border-blue-600' : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600')}>Serper（默认）</button>
              <button type="button" onClick={() => updateConfig({ webSearchBackend: 'jina' })} className={cn('flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors', config?.webSearchBackend === 'jina' ? 'bg-blue-600 text-white border-blue-600' : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600')}>Jina</button>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1.5">
              {config?.webSearchBackend === 'jina'
                ? 'Jina：搜索 s.jina.ai、读取 r.jina.ai（读取免 Key）'
                : 'Serper：搜索 google.serper.dev、读取 scrape.serper.dev，共用同一 Key'}
            </p>
          </div>

          {/* Serper Key：默认后端时显示（前置） */}
          {(config?.webSearchBackend ?? 'serper') === 'serper' && (
            <div>
              <label className="block text-xs font-medium mb-1.5 text-zinc-600 dark:text-zinc-300">
                Serper API Key
                <a href="https://serper.dev/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-normal ml-1">获取</a>
              </label>
              <div className="flex gap-2">
                <input type="password" className={inputCls} value={config?.serperApiKey ?? ''} onChange={e => updateConfig({ serperApiKey: e.target.value.trim() })} placeholder="serper.dev API Key" autoComplete="off" />
              </div>
            </div>
          )}

          {/* Jina Key：仅当选 Jina 时显示 */}
          {config?.webSearchBackend === 'jina' && (
            <div>
              <label className="block text-xs font-medium mb-1.5 text-zinc-600 dark:text-zinc-300">
                Jina API Key
                <a href="https://jina.ai/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-normal ml-1">获取</a>
              </label>
              <div className="flex gap-2">
                <input type="password" className={inputCls} value={config?.jinaApiKey ?? ''} onChange={e => updateConfig({ jinaApiKey: e.target.value.trim() })} placeholder="jina_..." autoComplete="off" />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}