import { useEffect, useRef, useMemo } from 'react';
import { useAIStore, AIContext, UIContextInfo, UILocation } from '@/store/useAIStore';

interface UseUIContextOptions {
  /** 界面位置标识 */
  location: UILocation;
  /** 学科 ID（可选） */
  subjectId?: string;
  /** 学科名称（可选） */
  subjectName?: string;
  /** 当前激活的标签（可选） */
  activeTab?: string;
  /** 实体 ID（可选，如笔记ID、导图ID等） */
  entityId?: string;
  /** 实体名称（可选） */
  entityName?: string;
  /** 实体类型（可选） */
  entityType?: string;
  /** 额外信息（可选） */
  additionalInfo?: Record<string, any>;
  /** 自定义上下文生成函数（可选） */
  getCustomContext?: () => string;
  /** 上下文唯一标识（可选，用于防止重复注册） */
  contextId?: string;
}

/**
 * 动态向全局 AI 状态仓库注入上下文信息的自定义 Hook
 * 会根据入参生成唯一的 contextId 和依赖对比串，并在组件卸载时自动清理
 *
 * @param options - 包含路由位置、学科关联、实体信息及自定义回调的配置项
 *
 * @example
 * useUIContext({
 *   location: 'mindmap_editor',
 *   subjectId: subject.id,
 *   subjectName: subject.name,
 *   entityId: mindmap.id,
 *   entityName: mindmap.title,
 *   entityType: 'mindmap',
 *   getCustomContext: () => `当前导图有 ${nodes.length} 个节点`
 * });
 */
export function useUIContext(options: UseUIContextOptions) {
  const { setContext } = useAIStore();
  
  const {
    location,
    subjectId,
    subjectName,
    activeTab,
    entityId,
    entityName,
    entityType,
    additionalInfo,
    getCustomContext,
    contextId
  } = options;

  // 序列化 additionalInfo 为字符串，用于依赖比较
  const additionalInfoStr = useMemo(() => {
    return additionalInfo ? JSON.stringify(additionalInfo) : undefined;
  }, [additionalInfo]);

  // 使用 ref 存储 getCustomContext 函数
  const getCustomContextRef = useRef(getCustomContext);
  getCustomContextRef.current = getCustomContext;

  // 生成稳定的 contextId
  const stableContextId = contextId || entityId || subjectId || location;

  // 序列化上下文信息用于比较
  const contextKey = useMemo(() => {
    return JSON.stringify({ 
      location, 
      subjectId, 
      subjectName, 
      activeTab, 
      entityId, 
      entityName, 
      entityType, 
      additionalInfoStr 
    });
  }, [location, subjectId, subjectName, activeTab, entityId, entityName, entityType, additionalInfoStr]);

  // 存储上次设置的上下文 key，避免重复设置
  const lastContextKeyRef = useRef<string | null>(null);

  // 注册上下文到全局 store
  useEffect(() => {
    // 如果上下文没有变化，不重新设置
    if (contextKey === lastContextKeyRef.current) {
      return;
    }
    lastContextKeyRef.current = contextKey;

    const uiContext: UIContextInfo = { location };
    
    if (subjectId) uiContext.subjectId = subjectId;
    if (subjectName) uiContext.subjectName = subjectName;
    if (activeTab) uiContext.activeTab = activeTab;
    if (entityId) uiContext.entityId = entityId;
    if (entityName) uiContext.entityName = entityName;
    if (entityType) uiContext.entityType = entityType;
    if (additionalInfo) uiContext.additionalInfo = additionalInfo;
    
    const context: AIContext = {
      id: stableContextId,
      uiContext,
      getSystemContext: getCustomContextRef.current || (() => '')
    };
    
    setContext(context);
    
    // 组件卸载时清除上下文
    return () => {
      setContext(null);
      lastContextKeyRef.current = null;
    };
  }, [contextKey, stableContextId, setContext, location, subjectId, subjectName, activeTab, entityId, entityName, entityType, additionalInfo]);
}

/**
 * 便捷 Hook：为特定学科详情视图注册上下文
 *
 * @param subjectId - 学科的唯一标识
 * @param subjectName - 学科的名称
 * @param activeTab - 当前激活的功能模块标签页标识
 */
export function useSubjectContext(
  subjectId: string | undefined,
  subjectName: string | undefined,
  activeTab?: string
) {
  useUIContext({
    location: 'subject_view',
    subjectId,
    subjectName,
    activeTab,
    contextId: `subject-${subjectId}`
  });
}

/**
 * 便捷 Hook：为知识笔记模块或具体笔记编辑器注册上下文
 * 动态判断是处在列表浏览还是正在编辑单篇笔记状态
 *
 * @param subjectId - 关联的学科 ID
 * @param subjectName - 关联的学科名称
 * @param noteId - 具体打开的笔记 ID（可选）
 * @param noteTitle - 具体打开的笔记标题（可选）
 * @param isEditing - 是否处于编辑模式（可选）
 */
export function useNotesContext(
  subjectId: string,
  subjectName: string | undefined,
  noteId?: string,
  noteTitle?: string,
  isEditing?: boolean
) {
  // 序列化 additionalInfo
  const additionalInfo = useMemo(() => {
    return isEditing ? { isEditing: true } : undefined;
  }, [isEditing]);
  
  // 生成稳定的 custom context 字符串
  const customContextStr = useMemo(() => {
    if (noteId && noteTitle) {
      return `用户正在${isEditing ? '编辑' : '查看'}笔记《${noteTitle}》。可以使用工具来更新或查看笔记内容。`;
    }
    return `用户正在笔记列表页面，可以创建新笔记或选择已有笔记。`;
  }, [noteId, noteTitle, isEditing]);

  const getCustomContext = useMemo(() => {
    return () => customContextStr;
  }, [customContextStr]);

  useUIContext({
    location: 'notes_module',
    subjectId,
    subjectName,
    entityId: noteId,
    entityName: noteTitle,
    entityType: 'note',
    additionalInfo,
    contextId: noteId ? `note-${noteId}` : `notes-module-${subjectId}`,
    getCustomContext
  });
}

/**
 * 便捷 Hook：为思维导图编辑器注册上下文
 * 能向 AI 反馈导图节点数量和编辑状态
 *
 * @param subjectId - 关联的学科 ID
 * @param subjectName - 关联的学科名称
 * @param mindmapId - 导图 ID（可选）
 * @param mindmapTitle - 导图名称（可选）
 * @param nodeCount - 导图当前包含的节点总数（可选）
 */
export function useMindMapContext(
  subjectId: string,
  subjectName: string | undefined,
  mindmapId?: string,
  mindmapTitle?: string,
  nodeCount?: number
) {
  // 序列化 additionalInfo
  const additionalInfo = useMemo(() => {
    return nodeCount !== undefined ? { nodeCount } : undefined;
  }, [nodeCount]);
  
  // 生成稳定的 custom context 字符串
  const customContextStr = useMemo(() => {
    if (mindmapId && mindmapTitle) {
      const nodeInfo = nodeCount !== undefined ? `，共有 ${nodeCount} 个节点` : '';
      return `用户正在编辑思维导图《${mindmapTitle}》${nodeInfo}。可以使用工具来更新节点或结构。`;
    }
    return `用户正在思维导图编辑器中。`;
  }, [mindmapId, mindmapTitle, nodeCount]);

  const getCustomContext = useMemo(() => {
    return () => customContextStr;
  }, [customContextStr]);

  useUIContext({
    location: 'mindmap_editor',
    subjectId,
    subjectName,
    entityId: mindmapId,
    entityName: mindmapTitle,
    entityType: 'mindmap',
    additionalInfo,
    contextId: mindmapId ? `mindmap-${mindmapId}` : `mindmap-module-${subjectId}`,
    getCustomContext
  });
}

/**
 * 便捷 Hook：为题库模块注册上下文
 * 提供 AI 当前所在题库的试题总量信息
 *
 * @param subjectId - 关联的学科 ID
 * @param subjectName - 关联的学科名称
 * @param quizBankId - 题库 ID（可选）
 * @param quizBankTitle - 题库名称（可选）
 * @param questionCount - 题库题目总数（可选）
 */
export function useQuizContext(
  subjectId: string,
  subjectName: string | undefined,
  quizBankId?: string,
  quizBankTitle?: string,
  questionCount?: number
) {
  // 序列化 additionalInfo
  const additionalInfo = useMemo(() => {
    return questionCount !== undefined ? { questionCount } : undefined;
  }, [questionCount]);
  
  // 生成稳定的 custom context 字符串
  const customContextStr = useMemo(() => {
    if (quizBankId && quizBankTitle) {
      const qInfo = questionCount !== undefined ? `，共有 ${questionCount} 道题目` : '';
      return `用户正在查看题库《${quizBankTitle}》${qInfo}。可以使用工具来管理题目。`;
    }
    return `用户正在题库模块中。`;
  }, [quizBankId, quizBankTitle, questionCount]);

  const getCustomContext = useMemo(() => {
    return () => customContextStr;
  }, [customContextStr]);

  useUIContext({
    location: 'quiz_module',
    subjectId,
    subjectName,
    entityId: quizBankId,
    entityName: quizBankTitle,
    entityType: 'quiz_bank',
    additionalInfo,
    contextId: quizBankId ? `quiz-${quizBankId}` : `quiz-module-${subjectId}`,
    getCustomContext
  });
}

/**
 * 便捷 Hook：为全局首页仪表盘注册上下文
 * 指示 AI 用户正在查看整体概览
 */
export function useDashboardContext() {
  const getCustomContext = useMemo(() => {
    return () => `用户正在查看仪表盘/首页，可以看到学习概览和学科列表。`;
  }, []);

  useUIContext({
    location: 'dashboard',
    contextId: 'dashboard',
    getCustomContext
  });
}

/**
 * 便捷 Hook：为特定学科下的任务清单模块注册上下文
 *
 * @param subjectId - 关联的学科 ID
 * @param subjectName - 关联的学科名称
 */
export function useTasksContext(
  subjectId: string,
  subjectName: string | undefined
) {
  const getCustomContext = useMemo(() => {
    return () => `用户正在查看任务列表。可以使用工具来管理任务。`;
  }, []);

  useUIContext({
    location: 'tasks_module',
    subjectId,
    subjectName,
    contextId: `tasks-${subjectId}`,
    getCustomContext
  });
}

export default useUIContext;
