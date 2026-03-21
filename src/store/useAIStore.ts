import { create } from 'zustand';
import { db, AISettings } from '@/db';

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
 * 集中管理 AI 的系统配置、悬浮对话窗状态、以及全局会话和上下文数据
 */
interface AIStore {
  settings: AISettings | null;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AISettings>) => Promise<void>;

  isFloatingWindowOpen: boolean;
  isFloatingWindowMinimized: boolean;
  floatingWindowPosition: { x: number; y: number };
  floatingWindowSize: { width: number; height: number };

  setFloatingWindowOpen: (open: boolean) => void;
  setFloatingWindowMinimized: (minimized: boolean) => void;
  setFloatingWindowPosition: (x: number, y: number) => void;
  setFloatingWindowSize: (width: number, height: number) => void;

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
export const useAIStore = create<AIStore>((set, get) => ({
  settings: null,
  isLoading: true,

  isFloatingWindowOpen: false,
  isFloatingWindowMinimized: false,
  floatingWindowPosition: { x: window.innerWidth - 420, y: 100 },
  floatingWindowSize: { width: 400, height: 600 },

  loadSettings: async () => {
    try {
      let settings = await db.settings.get(1);
      if (!settings) {
        settings = {
          id: 1,
          provider: 'openai',
          apiKey: '',
          baseUrl: 'https://api.kourichat.com/v1',
          model: '',
          maxTokens: 8192,
          temperature: 0.7
        };
        await db.settings.put(settings);
      }
      set({ settings, isLoading: false });
    } catch (error) {
      console.error("Failed to load AI settings", error);
      set({ isLoading: false });
    }
  },

  updateSettings: async (newSettings) => {
    const current = get().settings;
    if (!current) return;
    const updated = { ...current, ...newSettings, id: 1 } as AISettings;
    await db.settings.put(updated);
    set({ settings: updated });
  },

  setFloatingWindowOpen: (open) => set({ isFloatingWindowOpen: open }),
  setFloatingWindowMinimized: (minimized) => set({ isFloatingWindowMinimized: minimized }),
  setFloatingWindowPosition: (x, y) => set({ floatingWindowPosition: { x, y } }),
  setFloatingWindowSize: (width, height) => set({ floatingWindowSize: { width, height } }),

  currentContext: null,
  setContext: (context) => set({ currentContext: context }),

  globalSessionId: null,
  setGlobalSessionId: (id) => set({ globalSessionId: id }),
}));
