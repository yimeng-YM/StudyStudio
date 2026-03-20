import { create } from 'zustand';
import { db, AISettings } from '@/db';

// 界面位置类型
export type UILocation =
  | 'dashboard'           // 仪表盘/首页
  | 'subject_view'        // 学科详情页
  | 'mindmap_editor'      // 思维导图编辑器
  | 'notes_module'        // 知识笔记模块
  | 'quiz_module'         // 题库模块
  | 'tasks_module'        // 任务列表模块
  | 'settings'            // 设置页面
  | 'ai_chat';            // AI 聊天页面

// 界面上下文信息
export interface UIContextInfo {
  location: UILocation;           // 当前界面位置
  subjectId?: string;             // 当前学科 ID
  subjectName?: string;           // 当前学科名称
  activeTab?: string;             // 当前激活的标签页
  entityId?: string;              // 当前实体 ID（如笔记ID、导图ID等）
  entityName?: string;            // 当前实体名称
  entityType?: string;            // 当前实体类型
  additionalInfo?: Record<string, any>;  // 额外信息
}

export interface AIContext {
  getSystemContext: () => string;
  id?: string; // Optional identifier to prevent overwriting by same component
  // 新增：结构化的界面上下文
  uiContext?: UIContextInfo;
}

interface AIStore {
  settings: AISettings | null;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AISettings>) => Promise<void>;

  // Floating Window State
  isFloatingWindowOpen: boolean;
  isFloatingWindowMinimized: boolean;
  floatingWindowPosition: { x: number; y: number };
  floatingWindowSize: { width: number; height: number };

  setFloatingWindowOpen: (open: boolean) => void;
  setFloatingWindowMinimized: (minimized: boolean) => void;
  setFloatingWindowPosition: (x: number, y: number) => void;
  setFloatingWindowSize: (width: number, height: number) => void;

  // Context Management
  currentContext: AIContext | null;
  setContext: (context: AIContext | null) => void;

  // Global Chat Session
  globalSessionId: string | null;
  setGlobalSessionId: (id: string | null) => void;
}

// 将 UIContextInfo 转换为可读的系统提示文本
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

// 获取完整的上下文系统提示
export function getFullContextPrompt(context: AIContext | null): string {
  if (!context) return '';

  let prompt = '';

  // 添加结构化的界面上下文
  if (context.uiContext) {
    prompt += formatUIContextForPrompt(context.uiContext);
  }

  // 添加自定义上下文
  const customContext = context.getSystemContext();
  if (customContext) {
    prompt += `\n\n## 组件特定上下文\n${customContext}`;
  }

  return prompt;
}

export const useAIStore = create<AIStore>((set, get) => ({
  settings: null,
  isLoading: true,

  // Default Window State
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
