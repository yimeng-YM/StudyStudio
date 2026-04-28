import Dexie, { Table } from 'dexie';

/**
 * 学科实体数据结构。
 * 承载了顶层的科目分类信息，作为所有学习资料（笔记、导图等）的归属容器。
 */
export interface Subject {
  /** 唯一标识符，采用 UUID 格式 */
  id: string;
  /** 学科名称，如"数学"、"计算机科学"等 */
  name: string;
  /** 学科的图标，用于界面展示，通常是 emoji 或者预设图标名称 */
  icon?: string;
  /** 针对该学科的补充描述信息 */
  description?: string;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 最后访问时间戳，用于计算学科列表的最近访问排序 */
  lastAccessed?: number;
  /** 自定义排序权重，支持用户手动调整显示顺序 */
  order?: number;
}

/**
 * 系统支持的核心实体资源类型枚举。
 * 涵盖了学习过程中所需的多维知识载体形态。
 */
export type EntityType = 'mindmap' | 'task' | 'note' | 'flashcard' | 'task_board' | 'file' | 'notes_overview' | 'quiz_bank';

/**
 * 核心实体数据结构，抽象了所有具体的业务模块（如思维导图、笔记、任务板等）。
 * 通过 `type` 字段区分具体业务模块，并将核心业务数据以 JSON 格式存储于 `content` 中。
 */
export interface Entity {
  /** 唯一标识符，采用 UUID 格式 */
  id: string;
  /** 实体业务类型，决定了系统如何解析和渲染 content 内容 */
  type: EntityType;
  /** 归属的学科 ID，建立与 Subject 的多对一关系 */
  subjectId: string;
  /** 实体标题，通常用于列表展示或检索 */
  title: string;
  /**
   * 实体具体的业务内容载体。
   * 根据 type 的不同，存储对应结构的序列化数据（例如思维导图的节点数据，或是富文本笔记内容）。
   */
  content: any;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 更新时间戳，用于同步或冲突检测基准 */
  updatedAt: number;
  /** 最后访问时间，用于提供"最近使用"的功能支持 */
  lastAccessed?: number;
  /** 自定义排序权重，用于调整实体列表中的位置 */
  order?: number;
  /** 自定义标签数组，支持对实体进行多维度的跨学科检索和分类 */
  tags?: string[];
  /** 关联的 AI 对话会话 ID，实现实体内容与 AI 辅导上下文的绑定 */
  chatSessionId?: string;
}

/**
 * 实体间关系数据结构，用于构建知识图谱。
 * 记录不同实体之间的关联网络，例如笔记到导图的引用，或任务到笔记的关联。
 */
export interface Relation {
  /** 关系记录唯一标识 */
  id: string;
  /** 源实体的 ID */
  sourceId: string;
  /** 目标实体的 ID */
  targetId: string;
  /**
   * 关系的语义类型。
   * - 'related': 平级关联关系
   * - 'child': 包含或层级从属关系
   * - 'reference': 引用和依赖关系
   */
  type: string;
  /** 关系建立的时间戳 */
  createdAt: number;
}

/**
 * AI 服务配置数据结构。
 * 存储不同大语言模型供应商的 API 鉴权和模型生成参数。
 */
export interface AISettings {
  /** 本地记录 ID（通常单例存储，ID 固定） */
  id: number;
  /** 供应商类型，目前支持 openai、gemini 以及自建服务 custom */
  provider: 'openai' | 'gemini' | 'custom';
  /** 访问凭证（密钥） */
  apiKey: string;
  /** 接口基础地址，方便支持 API 代理或私有化部署的兼容 */
  baseUrl: string;
  /** 用于核心业务推理或生成的模型标识（如 gpt-4） */
  model: string;
  /** 专用于实体命名的轻量级模型，用于节约成本及提升速度 */
  namingModel?: string;
  /** 单次请求生成的最大上下文 Token 限制 */
  maxTokens?: number;
  /** 生成的随机性控制参数（0.0 ~ 2.0，数值越高越具发散性） */
  temperature?: number;
  /** 缓存的可用模型列表，避免频繁请求 API */
  modelList?: string[];
  /** 模型列表缓存时间戳 */
  modelListUpdatedAt?: number;
}

/**
 * AI 对话会话元数据。
 * 管理一次连续上下文交流的基础信息。
 */
export interface ChatSession {
  /** 会话唯一标识 */
  id: string;
  /** 会话主题或概括名称 */
  title: string;
  /**
   * 会话驱动模式。
   * - 'plan': 偏向于任务拆解和学习计划制定
   * - 'act': 偏向于知识问答和具体行动执行
   */
  mode?: 'plan' | 'act';
  /** 会话创建的时间戳 */
  createdAt: number;
  /** 会话最后更新时间戳 */
  updatedAt: number;
}

/**
 * AI 对话消息记录。
 * 遵循 OpenAI 格式标准的消息载体结构，支持工具调用逻辑。
 */
export interface ChatMessage {
  /** 消息唯一标识 */
  id: string;
  /** 所属的 ChatSession 会话 ID */
  sessionId: string;
  /** 角色身份：系统预设、用户输入、AI 助手回复、或工具执行结果 */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** 消息体文本或多模态内容（对象形式） */
  content: any;
  /** AI 发起的工具调用请求列表（供 function calling 使用） */
  tool_calls?: any[];
  /** 若当前消息是工具执行结果（role='tool'），此处记录对应的工具调用 ID */
  tool_call_id?: string;
  /** 当 role='tool' 时，记录工具名称；当 role='user'/'assistant' 且存在多个发言者时用于区分身份 */
  name?: string;
  /** DeepSeek thinking 模式的推理内容，必须在后续请求中原样回传 */
  reasoning_content?: string;
  /** 消息创建时间戳 */
  createdAt: number;
}

/**
 * 本地多媒体附件元数据。
 * 用于将图片或文档作为知识辅助材料缓存到本地数据库。
 */
export interface Attachment {
  /** 附件唯一标识 */
  id: string;
  /** 附件的 Base64 编码或 Blob 引用字符串 */
  data: string;
  /** 附件类型标识（如 'image/png', 'application/pdf'） */
  mimeType: string;
  /** 附件原始文件名 */
  fileName: string;
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * 学习行为打卡记录。
 * 用于汇总统计用户在特定日期的学习时长。
 */
export interface StudyRecord {
  /** 记录归属的日期，格式要求为 YYYY-MM-DD，作为主键使用 */
  date: string;
  /** 当日累计学习时长（单位：分钟） */
  duration: number;
  /** 当日最后一次有效活跃时间戳，用于防抖动和断线续录处理 */
  lastActive: number;
}

/**
 * 题库练习记录。
 * 记录每道题的作答历史，用于追踪练习进度和正确率。
 */
export interface QuizRecord {
  /** 记录唯一标识，格式为 `${quizId}_${questionId}` */
  id: string;
  /** 所属题库 ID */
  quizId: string;
  /** 题目 ID */
  questionId: string;
  /** 用户最后一次提交的答案 */
  userAnswer: any;
  /** 最后一次判题结果（主观题为 null） */
  isCorrect: boolean | null;
  /** 最后一次作答时间戳 */
  attemptedAt: number;
  /** 累计作答次数 */
  attemptCount: number;
}

/**
 * 基于 Dexie 封装的本地 IndexedDB 数据库管理类。
 * 负责定义数据表结构、索引规则以及控制跨版本的数据迁移逻辑。
 */
export class StudyStudioDB extends Dexie {
  subjects!: Table<Subject>;
  entities!: Table<Entity>;
  relations!: Table<Relation>;
  settings!: Table<AISettings>;
  chatSessions!: Table<ChatSession>;
  chatMessages!: Table<ChatMessage>;
  attachments!: Table<Attachment>;
  studyRecords!: Table<StudyRecord>;
  quizRecords!: Table<QuizRecord>;

  constructor() {
    super('StudyStudioDB');
    
    // 初始版本：核心模型映射
    this.version(1).stores({
      subjects: 'id, name, createdAt',
      entities: 'id, type, subjectId, title, createdAt, updatedAt, *tags',
      relations: 'id, sourceId, targetId, type',
      settings: 'id'
    });

    // 版本2：引入 AI 聊天模块
    this.version(2).stores({
      chatSessions: 'id, title, createdAt, updatedAt',
      chatMessages: 'id, sessionId, createdAt'
    });

    // 版本3：聊天会话支持绑定到实体 ID
    this.version(3).stores({
      chatSessions: 'id, title, entityId, createdAt, updatedAt'
    });

    // 版本4：添加实体排序和最近访问追踪，并在升级时应用初始值
    this.version(4).stores({
      subjects: 'id, name, createdAt, lastAccessed, order',
      entities: 'id, type, subjectId, title, createdAt, updatedAt, lastAccessed, order, *tags'
    }).upgrade(async tx => {
      await tx.table('subjects').toCollection().modify(subject => {
        if (!subject.lastAccessed) subject.lastAccessed = subject.createdAt;
        if (subject.order === undefined) subject.order = subject.createdAt;
      });
      await tx.table('entities').toCollection().modify(entity => {
        if (!entity.lastAccessed) entity.lastAccessed = entity.updatedAt || entity.createdAt;
        if (entity.order === undefined) entity.order = entity.createdAt;
      });
    });

    // 版本5：增加附件存储表
    this.version(5).stores({
      attachments: 'id, createdAt'
    });

    // 版本6：优化实体表索引结构，新增 [subjectId+type] 复合索引，提高分类检索性能
    this.version(6).stores({
      entities: 'id, type, subjectId, [subjectId+type], title, createdAt, updatedAt, lastAccessed, order, *tags'
    });

    // 版本7：聊天会话新增来源类型关联，用于区分触发上下文
    this.version(7).stores({
      chatSessions: 'id, title, entityId, sourceType, createdAt, updatedAt'
    });

    // 版本8：增加学习记录统计功能
    this.version(8).stores({
      studyRecords: 'date'
    });

    // 版本9：重构聊天会话的模式设计和消息角色结构
    this.version(9).stores({
      chatSessions: 'id, title, mode, createdAt, updatedAt',
      chatMessages: 'id, sessionId, role, createdAt'
    });

    // 版本10：新增题库练习记录表
    this.version(10).stores({
      quizRecords: 'id, quizId, questionId, attemptedAt'
    });
  }
}

/** 
 * 暴露给全局的数据库单例实例，应用在初始化和运行时均依赖于此实例进行本地数据交互。
 */
export const db = new StudyStudioDB();
