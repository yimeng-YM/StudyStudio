import { create } from 'zustand';
import { db, AISettings, Provider, AIConfig } from '@/db';
import { getModels } from '@/services/ai';
import { DEFAULT_PROVIDER_BASE_URL, DEFAULT_PROVIDER_NAME } from '@/lib/providerTemplates';

/**
 * 界面位置类型
 * 标识用户当前所处的应用界面模块
 */
export type UILocation =
  | 'dashboard'
  | 'subject_view'
  | 'mindmap_editor'
  | 'notes_module'
  | 'quiz_module'
  | 'tasks_module'
  | 'settings'
  | 'ai_chat';

/**
 * 界面上下文信息
 * 结构化提供 AI 当前所处环境的信息，辅助 AI 理解用户的意图和操作上下文
 */
export interface UIContextInfo {
  location: UILocation;
  subjectId?: string;
  subjectName?: string;
  activeTab?: string;
  entityId?: string;
  entityName?: string;
  entityType?: string;
  additionalInfo?: Record<string, any>;
}

/**
 * AI 上下文配置
 * 聚合了界面上下文信息以及获取系统特定上下文的方法，防止不同组件覆盖时丢失关键信息
 */
export interface AIContext {
  getSystemContext: () => string;
  id?: string;
  uiContext?: UIContextInfo;
}

/**
 * AI 状态管理 Store 接口
 * 集中管理 AI 的供应商预设、运行时配置、解析后有效配置、悬浮对话窗状态以及全局会话和上下文数据
 */
interface AIStore {
  /** 全部供应商预设列表 */
  providers: Provider[];
  /** 全局运行时配置（单例原始记录，id=1） */
  config: AIConfig | null;
  /** 解析后的有效配置（合并激活供应商 + config + 命名供应商），供 AI 服务直接消费 */
  settings: AISettings | null;
  isLoading: boolean;

  /** 加载供应商与配置，首次运行时初始化默认供应商，并解析出有效配置 */
  loadSettings: () => Promise<void>;
  /** 新增供应商，返回新 id */
  addProvider: (data: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    modelList?: string[];
    modelListUpdatedAt?: number;
    order?: number;
  }) => Promise<string>;
  /** 更新指定供应商的字段 */
  updateProvider: (id: string, patch: Partial<Provider>) => Promise<void>;
  /** 删除供应商；若删的是当前激活项则自动切换到其他项 */
  deleteProvider: (id: string) => Promise<void>;
  /** 设为当前激活供应商；若当前模型不在新供应商清单内则置空或选首个 */
  setActiveProvider: (id: string) => Promise<void>;
  /** 更新运行时配置（模型、命名、参数等） */
  updateConfig: (patch: Partial<AIConfig>) => Promise<void>;
  /** 整体替换某供应商的模型清单 */
  setProviderModels: (id: string, modelList: string[]) => Promise<void>;
  /** 向某供应商清单去重追加模型 */
  addProviderModels: (id: string, models: string[]) => Promise<void>;
  /** 从某供应商清单移除一个模型 */
  removeProviderModel: (id: string, model: string) => Promise<void>;
  /** 拉取某供应商的 API 全量模型 id 列表，供 UI 筛选添加（不直接落库） */
  fetchAvailableModels: (provider: { baseUrl: string; apiKey: string }) => Promise<string[]>;

  isFloatingWindowOpen: boolean;
  isFloatingWindowMinimized: boolean;
  /** AI 窗口显示模式：'floating' 悬浮窗 | 'sidebar' 右侧侧边栏 */
  aiWindowMode: 'floating' | 'sidebar';
  /** 悬浮触发按钮的位置（与窗口位置独立保存，开启窗口时按钮自动隐藏） */
  floatingButtonPosition: { x: number; y: number };
  /** 悬浮窗位置（独立于按钮位置，调整大小时不再被按钮位置拉回） */
  aiWindowPosition: { x: number; y: number };
  floatingWindowSize: { width: number; height: number };
  /** 侧边栏模式宽度 */
  aiSidebarWidth: number;

  setFloatingWindowOpen: (open: boolean) => void;
  setFloatingWindowMinimized: (minimized: boolean) => void;
  setAIWindowMode: (mode: 'floating' | 'sidebar') => void;
  setFloatingButtonPosition: (x: number, y: number) => void;
  setAIWindowPosition: (x: number, y: number) => void;
  setFloatingWindowSize: (width: number, height: number) => void;
  setAISidebarWidth: (width: number) => void;

  currentContext: AIContext | null;
  setContext: (context: AIContext | null) => void;

  globalSessionId: string | null;
  setGlobalSessionId: (id: string | null) => void;
}

/**
 * 将结构化的界面上下文转换为供 AI 模型读取的提示词文本
 * 解析当前的路由、实体状态等，以便 AI 能够基于自然语言理解用户意图
 *
 * @param uiContext - 结构化的界面上下文信息
 * @returns 格式化后的上下文系统提示词片段
 */
export function formatUIContextForPrompt(uiContext: UIContextInfo | undefined): string {
  if (!uiContext) return '';

  const locationNames: Record<UILocation, string> = {
    'dashboard': '仪表盘/首页',
    'subject_view': '学科详情页',
    'mindmap_editor': '思维导图编辑器',
    'notes_module': '知识笔记模块',
    'quiz_module': '题库模块',
    'tasks_module': '任务列表模块',
    'settings': '设置页面',
    'ai_chat': 'AI 聊天页面'
  };

  let context = `\n## 用户当前界面上下文`;
  context += `\n- 当前页面: ${locationNames[uiContext.location] || uiContext.location}`;

  if (uiContext.subjectId && uiContext.subjectName) {
    context += `\n- 当前学科: ${uiContext.subjectName} (ID: ${uiContext.subjectId})`;
  }

  if (uiContext.activeTab) {
    const tabNames: Record<string, string> = {
      'mindmap': '思维导图',
      'notes': '知识笔记',
      'quiz': '题库',
      'tasks': '任务列表'
    };
    context += `\n- 当前标签: ${tabNames[uiContext.activeTab] || uiContext.activeTab}`;
  }

  if (uiContext.entityId && uiContext.entityName) {
    const entityTypeNames: Record<string, string> = {
      'mindmap': '思维导图',
      'note': '笔记',
      'quiz_bank': '题库',
      'task_board': '任务清单'
    };
    const entityTypeName = uiContext.entityType ? (entityTypeNames[uiContext.entityType] || uiContext.entityType) : '内容';
    context += `\n- 当前${entityTypeName}: ${uiContext.entityName} (ID: ${uiContext.entityId})`;
  }

  if (uiContext.additionalInfo && Object.keys(uiContext.additionalInfo).length > 0) {
    context += `\n- 额外信息: ${JSON.stringify(uiContext.additionalInfo)}`;
  }

  return context;
}

/**
 * 获取完整的系统上下文提示词
 * 结合了结构化的界面上下文与各组件自定义的系统上下文逻辑
 *
 * @param context - 当前的全局 AI 上下文
 * @returns 拼接后的完整系统提示词
 */
export function getFullContextPrompt(context: AIContext | null): string {
  if (!context) return '';

  let prompt = '';

  if (context.uiContext) {
    prompt += formatUIContextForPrompt(context.uiContext);
  }

  const customContext = context.getSystemContext();
  if (customContext) {
    prompt += `\n\n## 组件特定上下文\n${customContext}`;
  }

  return prompt;
}

/**
 * 全局 AI 状态管理的 Zustand Store
 * 负责维护持久化设置、悬浮窗的交互状态以及跨组件的会话流转逻辑
 */
/**
 * 由「全局配置 + 供应商列表」解析出运行时有效配置（AISettings）。
 * 主供应商 = config.activeProviderId 指向的供应商（缺失则回退首个）；
 * 命名供应商 = config.namingProviderId 指向的供应商（缺失则回退主供应商）。
 */
function resolveSettings(config: AIConfig | null, providers: Provider[]): AISettings | null {
  if (!config || providers.length === 0) return null;
  const active = providers.find(p => p.id === config.activeProviderId) || providers[0];
  const naming = (config.namingProviderId ? providers.find(p => p.id === config.namingProviderId) : undefined) || active;
  return {
    id: config.id,
    providerId: active.id,
    providerName: active.name,
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model: config.model,
    modelList: active.modelList,
    modelListUpdatedAt: active.modelListUpdatedAt,
    namingProviderId: config.namingProviderId,
    namingProviderName: naming.name,
    namingBaseUrl: naming.baseUrl,
    namingApiKey: naming.apiKey,
    namingModel: config.namingModel,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  };
}

/** 生成一个新的供应商 id（优先 crypto.randomUUID，回退时间戳+随机串） */
function newProviderId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `prov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- AI 窗口位置/尺寸的持久化与默认值 ---
// 窗口与悬浮按钮的位置各自独立保存：开启窗口时按钮隐藏，窗口位置不再受按钮位置约束，
// 调整窗口大小不会把窗口拉回到按钮绑定的位置。

/** 悬浮触发按钮默认位置：页面右下角 */
const DEFAULT_BUTTON_POS = { x: window.innerWidth - 80, y: window.innerHeight - 80 };
/** 悬浮窗默认尺寸 */
const DEFAULT_WINDOW_SIZE = { width: 400, height: 600 };
/** 悬浮窗默认位置：右上角（与按钮解耦，按钮开启窗口时自动隐藏，故无需避让按钮） */
const DEFAULT_WINDOW_POS = { x: window.innerWidth - DEFAULT_WINDOW_SIZE.width - 24, y: 24 };
/** 侧边栏模式默认宽度 */
const DEFAULT_SIDEBAR_WIDTH = 380;
/** 悬浮按钮尺寸（用于将按钮位置约束在视口内） */
const FLOATING_BUTTON_SIZE = 60;

/** 从 localStorage 读取 JSON，失败或缺失时回退默认值 */
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}

/** 写入 JSON 到 localStorage，失败时静默 */
function saveJSON(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/** 将按钮位置约束在视口内，确保按钮始终可见、可拖拽 */
function clampButtonPos(p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(p.x, window.innerWidth - FLOATING_BUTTON_SIZE)),
    y: Math.max(0, Math.min(p.y, window.innerHeight - FLOATING_BUTTON_SIZE)),
  };
}

/**
 * 全局 AI 状态管理的 Zustand Store
 * 负责维护供应商预设、运行时配置、解析后有效配置、悬浮窗交互状态以及跨组件会话流转逻辑
 */
export const useAIStore = create<AIStore>((set, get) => ({
  providers: [],
  config: null,
  settings: null,
  isLoading: true,

  isFloatingWindowOpen: false,
  isFloatingWindowMinimized: false,
  aiWindowMode: loadJSON<'floating' | 'sidebar'>('aiWindowMode', 'floating'),
  floatingButtonPosition: clampButtonPos(loadJSON('aiButtonPos', DEFAULT_BUTTON_POS)),
  aiWindowPosition: loadJSON('aiWindowPos', DEFAULT_WINDOW_POS),
  floatingWindowSize: loadJSON('aiWindowSize', DEFAULT_WINDOW_SIZE),
  aiSidebarWidth: loadJSON('aiSidebarWidth', DEFAULT_SIDEBAR_WIDTH),

  loadSettings: async () => {
    try {
      let providers = await db.providers.toArray();
      let config = await db.settings.get(1) as AIConfig | undefined;
      if (providers.length === 0) {
        // 首次运行：创建默认供应商 + 默认配置指向它
        const now = Date.now();
        const defaultProvider: Provider = {
          id: newProviderId(),
          name: DEFAULT_PROVIDER_NAME,
          baseUrl: DEFAULT_PROVIDER_BASE_URL,
          apiKey: '',
          createdAt: now,
          order: now,
        };
        await db.providers.add(defaultProvider);
        providers = [defaultProvider];
        config = { id: 1, activeProviderId: defaultProvider.id, model: '' };
        await db.settings.put(config);
      } else if (!config) {
        // 有供应商但无配置（异常兜底）：默认指向首个供应商
        config = { id: 1, activeProviderId: providers[0].id, model: '' };
        await db.settings.put(config);
      }
      set({ providers, config: config ?? null, settings: resolveSettings(config ?? null, providers), isLoading: false });
    } catch (error) {
      console.error("Failed to load AI settings", error);
      set({ isLoading: false });
    }
  },

  addProvider: async (data) => {
    const now = Date.now();
    const provider: Provider = {
      id: newProviderId(),
      name: data.name,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey || '',
      modelList: data.modelList,
      modelListUpdatedAt: data.modelListUpdatedAt,
      createdAt: now,
      order: data.order ?? now,
    };
    await db.providers.add(provider);
    const providers = await db.providers.toArray();
    set({ providers, settings: resolveSettings(get().config, providers) });
    return provider.id;
  },

  updateProvider: async (id, patch) => {
    await db.providers.update(id, patch);
    const providers = await db.providers.toArray();
    set({ providers, settings: resolveSettings(get().config, providers) });
  },

  deleteProvider: async (id) => {
    const config = get().config;
    await db.providers.delete(id);
    const remaining = await db.providers.toArray();
    if (!config) {
      set({ providers: remaining, settings: resolveSettings(null, remaining) });
      return;
    }
    // 清理被删供应商的模型记忆
    const memory = { ...(config.modelByProvider || {}) };
    delete memory[id];
    let newConfig: AIConfig = { ...config, modelByProvider: memory };
    if (config.activeProviderId === id) {
      // 删的是当前供应商：切到其余首个，并恢复其记忆模型（无记忆则取清单首项）
      const newActive = remaining[0]?.id || '';
      const target = remaining[0];
      let restored = memory[newActive];
      if (restored === undefined) {
        restored = (target?.modelList?.length ? target.modelList[0] : '') || '';
        if (newActive) memory[newActive] = restored;
      }
      newConfig = { ...newConfig, activeProviderId: newActive, model: restored, modelByProvider: memory };
    }
    await db.settings.put(newConfig);
    set({ providers: remaining, config: newConfig, settings: resolveSettings(newConfig, remaining) });
  },

  setActiveProvider: async (id) => {
    const config = get().config;
    if (!config) return;
    const providers = get().providers;
    const target = providers.find(p => p.id === id);
    // 恢复该供应商上次选择的模型；无记忆则取清单首项，无清单则置空，并写入记忆以便下次切回仍是它
    const memory = { ...(config.modelByProvider || {}) };
    let model = memory[id];
    if (model === undefined) {
      model = (target?.modelList?.length ? target.modelList[0] : '') || '';
      memory[id] = model;
    }
    const newConfig: AIConfig = { ...config, activeProviderId: id, model, modelByProvider: memory };
    await db.settings.put(newConfig);
    set({ config: newConfig, settings: resolveSettings(newConfig, providers) });
  },

  updateConfig: async (patch) => {
    const current = get().config;
    if (!current) return;
    const newConfig: AIConfig = { ...current, ...patch, id: 1 };
    // 选择主模型时，同时记到该供应商的记忆表，切换走再切回可恢复
    if (patch.model !== undefined) {
      newConfig.modelByProvider = {
        ...(current.modelByProvider || {}),
        [current.activeProviderId]: patch.model,
      };
    }
    await db.settings.put(newConfig);
    set({ config: newConfig, settings: resolveSettings(newConfig, get().providers) });
  },

  setProviderModels: async (id, modelList) => {
    await db.providers.update(id, { modelList, modelListUpdatedAt: Date.now() });
    const providers = await db.providers.toArray();
    set({ providers, settings: resolveSettings(get().config, providers) });
  },

  addProviderModels: async (id, models) => {
    const provider = await db.providers.get(id);
    if (!provider) return;
    const existing = provider.modelList || [];
    const merged = Array.from(new Set([...existing, ...models.filter(Boolean)]));
    await db.providers.update(id, { modelList: merged, modelListUpdatedAt: Date.now() });
    const providers = await db.providers.toArray();
    set({ providers, settings: resolveSettings(get().config, providers) });
  },

  removeProviderModel: async (id, model) => {
    const provider = await db.providers.get(id);
    if (!provider) return;
    const merged = (provider.modelList || []).filter(m => m !== model);
    await db.providers.update(id, { modelList: merged, modelListUpdatedAt: Date.now() });
    const providers = await db.providers.toArray();
    set({ providers, settings: resolveSettings(get().config, providers) });
  },

  fetchAvailableModels: async (provider) => {
    const models = await getModels({ baseUrl: provider.baseUrl, apiKey: provider.apiKey });
    return models.map(m => m.id);
  },

  setFloatingWindowOpen: (open) => set({ isFloatingWindowOpen: open }),
  setFloatingWindowMinimized: (minimized) => set({ isFloatingWindowMinimized: minimized }),
  setAIWindowMode: (mode) => { saveJSON('aiWindowMode', mode); set({ aiWindowMode: mode }); },
  setFloatingButtonPosition: (x, y) => { const p = { x, y }; saveJSON('aiButtonPos', p); set({ floatingButtonPosition: p }); },
  setAIWindowPosition: (x, y) => { const p = { x, y }; saveJSON('aiWindowPos', p); set({ aiWindowPosition: p }); },
  setFloatingWindowSize: (width, height) => { const s = { width, height }; saveJSON('aiWindowSize', s); set({ floatingWindowSize: s }); },
  setAISidebarWidth: (width) => { saveJSON('aiSidebarWidth', width); set({ aiSidebarWidth: width }); },

  currentContext: null,
  setContext: (context) => set({ currentContext: context }),

  globalSessionId: null,
  setGlobalSessionId: (id) => set({ globalSessionId: id }),
}));
