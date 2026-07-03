import { useState, useRef, useEffect, useMemo } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { Provider } from '@/db';
import { PROVIDER_TEMPLATES, ProviderTemplate } from '@/lib/providerTemplates';
import { Modal } from '@/components/ui/Modal';
import { useDialog } from '@/components/ui/DialogProvider';
import { cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, Check, RefreshCw, Search, ChevronDown, X, Server, Cpu } from 'lucide-react';

const inputCls = "w-full border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow";

/**
 * 供应商新增/编辑统一表单。
 * 所有字段（名称、Base URL、API Key）与模型清单都先保存在本地 state，
 * 仅当点击「创建/保存」时才一次性持久化；点击「取消」不产生任何副作用。
 * 选择预设模板只是把名称与 Base URL 预填进表单，不会创建供应商。
 */
function ProviderForm({ provider, onClose }: { provider: Provider | null; onClose: () => void }) {
  const addProvider = useAIStore(s => s.addProvider);
  const updateProvider = useAIStore(s => s.updateProvider);
  const fetchAvailableModels = useAIStore(s => s.fetchAvailableModels);
  const { showAlert } = useDialog();
  const isEdit = !!provider;

  const [form, setForm] = useState({
    name: provider?.name || '',
    baseUrl: provider?.baseUrl || '',
    apiKey: provider?.apiKey || '',
  });
  const [models, setModels] = useState<string[]>(provider?.modelList || []);

  // 模型清单维护
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [manualModel, setManualModel] = useState('');
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => { if (!showModelDropdown) setModelSearch(''); }, [showModelDropdown]);

  const applyTemplate = (t: ProviderTemplate) => {
    setForm(f => ({ ...f, name: t.name, baseUrl: t.baseUrl }));
  };

  const handleFetchModels = async () => {
    if (!form.baseUrl.trim() || !form.apiKey.trim()) {
      showAlert('请先填写接口地址与 API Key', { title: '信息不完整' });
      return;
    }
    setFetchingModels(true);
    setFetchError('');
    try {
      const list = await fetchAvailableModels({ baseUrl: form.baseUrl, apiKey: form.apiKey });
      setAvailableModels(list);
      setShowModelDropdown(true);
      if (list.length === 0) setFetchError('接口未返回任何模型');
    } catch (e) {
      setFetchError('获取失败：' + (e as Error).message);
    } finally {
      setFetchingModels(false);
    }
  };

  const addModel = (m: string) => {
    const v = m.trim();
    if (!v) return;
    setModels(prev => prev.includes(v) ? prev : [...prev, v]);
    setManualModel('');
  };
  const removeModel = (m: string) => setModels(prev => prev.filter(x => x !== m));

  const filteredAvailable = useMemo(() => {
    if (!modelSearch) return availableModels;
    return availableModels.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()));
  }, [availableModels, modelSearch]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      showAlert('请填写供应商名称与接口地址', { title: '信息不完整' });
      return;
    }
    const payload = {
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey,
      modelList: models,
      modelListUpdatedAt: models.length > 0 ? Date.now() : undefined,
    };
    if (isEdit && provider) {
      await updateProvider(provider.id, payload);
    } else {
      await addProvider(payload);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isEdit ? `编辑供应商 · ${provider!.name}` : '新增供应商'}
      footer={
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 rounded-lg transition-colors text-sm">取消</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">{isEdit ? '保存' : '创建'}</button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 预设模板（仅新增时）——点击只预填表单，不创建 */}
        {!isEdit && (
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">从模板预填</p>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDER_TEMPLATES.map(t => (
                <button
                  key={t.name}
                  onClick={() => applyTemplate(t)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    form.name === t.name && form.baseUrl === t.baseUrl
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-800"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 border-zinc-200 dark:border-zinc-700"
                  )}
                  title={t.baseUrl}
                >
                  {t.name}{t.description ? ` · ${t.description}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-300">名称</label>
          <input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：我的代理" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-300">接口地址 (Base URL)</label>
          <input className={cn(inputCls, 'font-mono')} value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-300">API Key</label>
          <input type="password" className={cn(inputCls, 'font-mono')} value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." />
        </div>

        {/* 模型清单维护 */}
        <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">模型清单（{models.length}）</label>
            <button
              onClick={handleFetchModels}
              disabled={fetchingModels}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', fetchingModels && 'animate-spin')} />
              {fetchingModels ? '获取中' : '获取并添加模型'}
            </button>
          </div>

          {/* 已选模型 chips */}
          <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
            {models.length === 0 && (
              <span className="text-[11px] text-zinc-400">暂无模型，可获取或手动添加（取消不会保存任何改动）</span>
            )}
            {models.map(m => (
              <span key={m} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40">
                <span className="truncate max-w-[160px]">{m}</span>
                <button onClick={() => removeModel(m)} className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800/50 rounded-full transition-colors" title="移除">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>

          {/* 手动添加 */}
          <div className="flex gap-2 mb-2">
            <input
              className={cn(inputCls, 'flex-1')}
              value={manualModel}
              onChange={e => setManualModel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addModel(manualModel); } }}
              placeholder="输入模型名手动添加，回车确认"
            />
            <button
              onClick={() => addModel(manualModel)}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-colors whitespace-nowrap"
            >
              添加
            </button>
          </div>

          {/* 获取到的可筛选模型列表 */}
          {showModelDropdown && (
            <div ref={modelDropdownRef} className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
              <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                    placeholder="搜索筛选模型，点击加入清单..."
                    value={modelSearch}
                    onChange={e => setModelSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="overflow-y-auto max-h-44">
                {fetchError ? (
                  <div className="p-3 text-center text-red-500 text-xs">{fetchError}</div>
                ) : filteredAvailable.length === 0 ? (
                  <div className="p-3 text-center text-zinc-400 text-xs">未找到匹配的模型</div>
                ) : (
                  filteredAvailable.map(m => {
                    const added = models.includes(m);
                    return (
                      <div
                        key={m}
                        onClick={() => !added && addModel(m)}
                        className={cn(
                          "px-3 py-2 flex items-center justify-between text-sm transition-colors",
                          added ? "text-zinc-400 cursor-default" : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        )}
                      >
                        <span className="truncate">{m}</span>
                        {added ? <Check className="w-4 h-4 shrink-0 text-blue-500" /> : <Plus className="w-4 h-4 shrink-0 text-zinc-400" />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          {!showModelDropdown && fetchError && (
            <p className="text-[11px] text-red-500 mt-1">{fetchError}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * 供应商设置页。
 * 管理多个 AI 供应商预设：新增（含内置模板预填）、编辑、删除、设为当前；
 * 以及为每个供应商维护「用户挑选的模型清单」——可从 API 拉取并搜索筛选后加入，也可手动添加。
 * 新增与编辑共用一个表单，仅在保存时持久化，取消不产生副作用。
 * 当前激活供应商卡片上额外提供「当前模型」选择，写入运行时 config.model。
 */
export function ProviderSettings() {
  const providers = useAIStore(s => s.providers);
  const config = useAIStore(s => s.config);
  const deleteProvider = useAIStore(s => s.deleteProvider);
  const setActiveProvider = useAIStore(s => s.setActiveProvider);
  const updateConfig = useAIStore(s => s.updateConfig);
  const { showConfirm } = useDialog();

  // 统一的编辑/新增状态：null=关闭、'new'=新增、Provider=编辑
  const [editing, setEditing] = useState<Provider | 'new' | null>(null);

  // 当前激活供应商的「当前模型」下拉
  const [showActiveModelDropdown, setShowActiveModelDropdown] = useState(false);
  const [activeModelSearch, setActiveModelSearch] = useState('');
  const activeModelRef = useRef<HTMLDivElement>(null);

  const editingProvider = typeof editing === 'string' ? null : editing;
  const activeProvider = useMemo(
    () => providers.find(p => p.id === config?.activeProviderId) || null,
    [providers, config]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (activeModelRef.current && !activeModelRef.current.contains(e.target as Node)) {
        setShowActiveModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => { if (!showActiveModelDropdown) setActiveModelSearch(''); }, [showActiveModelDropdown]);

  const handleDelete = async (p: Provider) => {
    const ok = await showConfirm(`确定删除供应商「${p.name}」吗？该供应商的模型清单将一并移除。`, {
      title: '删除供应商', confirmText: '删除', type: 'confirm',
    });
    if (ok) await deleteProvider(p.id);
  };

  const filteredActiveModels = useMemo(() => {
    const list = activeProvider?.modelList || [];
    if (!activeModelSearch) return list;
    return list.filter(m => m.toLowerCase().includes(activeModelSearch.toLowerCase()));
  }, [activeProvider, activeModelSearch]);

  const selectActiveModel = async (m: string) => {
    await updateConfig({ model: m });
    setShowActiveModelDropdown(false);
  };

  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/80 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Server size={16} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">供应商</h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">管理多个 AI 供应商预设，快速切换；为每个供应商维护模型清单</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} /> 新增
        </button>
      </div>

      <div className="p-5 space-y-3">
        {providers.length === 0 && (
          <p className="text-center text-zinc-400 py-8 text-sm">暂无供应商，点击右上角「新增」添加。</p>
        )}

        {providers.map(p => {
          const isActive = config?.activeProviderId === p.id;
          return (
            <div key={p.id} className={cn(
              "rounded-lg border p-4 transition-all",
              isActive
                ? "border-blue-500/60 bg-blue-50/40 dark:bg-blue-900/10"
                : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700"
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg shrink-0",
                  isActive ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                )}>
                  <Server size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-zinc-800 dark:text-zinc-100 truncate">{p.name}</span>
                    {isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-blue-600 text-white font-medium">当前</span>
                    )}
                    <span className="text-xs text-zinc-400">· {p.modelList?.length || 0} 个模型</span>
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate mt-0.5">{p.baseUrl}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">API Key：{p.apiKey ? '已设置' : '未设置'}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isActive && (
                    <button
                      onClick={() => setActiveProvider(p.id)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors border border-zinc-200 dark:border-zinc-700"
                      title="设为当前供应商"
                    >
                      设为当前
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(p)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title="编辑"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="删除"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* 当前激活供应商：当前模型选择 */}
              {isActive && (
                <div className="mt-3 pt-3 border-t border-blue-200/50 dark:border-blue-900/30">
                  <label className="block text-xs font-medium mb-1.5 text-zinc-600 dark:text-zinc-300">当前模型</label>
                  <div ref={activeModelRef} className="relative">
                    <div
                      className="flex items-center border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                      onClick={() => setShowActiveModelDropdown(!showActiveModelDropdown)}
                    >
                      <Cpu size={14} className="text-zinc-400 mr-2 shrink-0" />
                      <span className={cn("flex-1 text-sm truncate", config?.model ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400")}>
                        {config?.model || '选择或输入模型名称...'}
                      </span>
                      <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform shrink-0", showActiveModelDropdown && "rotate-180")} />
                    </div>
                    {showActiveModelDropdown && (
                      <div className="mt-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-60 overflow-hidden">
                        <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                              className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                              placeholder="搜索模型，或输入后回车..."
                              value={activeModelSearch}
                              onChange={e => setActiveModelSearch(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { const v = activeModelSearch.trim(); if (v) selectActiveModel(v); } }}
                            />
                          </div>
                        </div>
                        <div className="overflow-y-auto max-h-44">
                          {filteredActiveModels.length === 0 ? (
                            <div className="p-3 text-center text-zinc-400 text-sm">
                              {activeProvider?.modelList?.length ? '未找到匹配的模型' : '该供应商暂无模型清单，请先编辑并添加模型，或在上方输入框直接输入模型名'}
                            </div>
                          ) : filteredActiveModels.map(m => (
                            <div
                              key={m}
                              className={cn(
                                "px-3 py-2 cursor-pointer flex items-center justify-between text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                                config?.model === m && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                              )}
                              onClick={() => selectActiveModel(m)}
                            >
                              <span className="truncate">{m}</span>
                              {config?.model === m && <Check className="w-4 h-4 shrink-0" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 新增/编辑统一表单（仅在打开时挂载，确保本地 state 每次重置） */}
      {editing && (
        <ProviderForm provider={editingProvider} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}