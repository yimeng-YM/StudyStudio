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
 * AI 供应商配置（预设）。
 * 每条记录代表一个可独立连接的大语言模型供应商（或自建代理），
 * 统一采用 OpenAI 兼容的 chat/completions 请求格式，不再区分 openai/custom。
 */
export interface Provider {
  /** 唯一标识符，采用 UUID 格式 */
  id: string;
  /** 供应商显示名称，如「DeepSeek」「我的代理」 */
  name: string;
  /** OpenAI 兼容接口基础地址，可含版本段（如 /v1、/v3、/v4） */
  baseUrl: string;
  /** 访问凭证（密钥） */
  apiKey: string;
  /** 用户挑选维护的可用模型清单（非 API 全量缓存，可为空）；用户可手动添加或从 /models 拉取筛选后加入 */
  modelList?: string[];
  /** 模型清单最近更新时间戳 */
  modelListUpdatedAt?: number;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 自定义排序权重，用于调整供应商列表顺序 */
  order?: number;
}

/**
 * 全局 AI 运行时配置（单例，id=1）。
 * 仅保存「当前选择」与「生成参数」；连接信息（baseUrl/apiKey/模型清单）都在 Provider 上。
 */
export interface AIConfig {
  /** 固定单例 ID = 1 */
  id: number;
  /** 当前激活的供应商 ID（主对话使用） */
  activeProviderId: string;
  /** 主对话使用的模型标识（始终对应当前激活供应商的选择） */
  model: string;
  /** 各供应商上次选择的模型记忆：providerId -> 模型名。切换供应商时据此恢复，切换走再切回仍是之前的模型 */
  modelByProvider?: Record<string, string>;
  /** 命名（会话标题）使用的供应商 ID；留空则使用主供应商 */
  namingProviderId?: string;
  /** 命名使用的模型标识；留空则回退主模型 */
  namingModel?: string;
  /** 单次请求生成的最大上下文 Token 限制 */
  maxTokens?: number;
  /** 生成的随机性控制参数（0.0 ~ 2.0，数值越高越具发散性） */
  temperature?: number;
  /** Jina 联网服务的 API Key（免费注册 https://jina.ai/）；留空时联网工具可能返回 401 */
  jinaApiKey?: string;
  /** 是否启用联网能力总开关（同时控制 web_search 与 read_url，二者同步开/关）；联网搜索后端需另配 API Key */
  webSearchEnabled?: boolean;
  /** 联网搜索/读取使用的后端：'serper'（默认，搜索走 google.serper.dev、读取走 scrape.serper.dev）或 'jina'（s.jina.ai 搜索 + r.jina.ai 读取） */
  webSearchBackend?: 'jina' | 'serper';
  /** Serper（google.serper.dev 搜索 + scrape.serper.dev 读取）API Key，仅当 webSearchBackend 为 'serper' 时使用 */
  serperApiKey?: string;
  /** 是否启用维基百科原站（wikipedia.org）API 查询；免 Key，但原站在部分网络被墙，默认关闭（如挂 VPN 可手动开启），受联网总开关联动约束 */
  wikipediaEnabled?: boolean;
  // 注：「维基百科站内搜」(search_wikipedia_web) 不设独立开关——联网总开关开启即自带该能力。
}

/**
 * 解析后的有效 AI 配置（仅运行时，不直接落库）。
 * 由 store 合并「激活 Provider + AIConfig + 命名 Provider」得到，
 * 供 ai.ts / aiGenerator.ts / runSubAgent.ts / useChatSession.ts 直接消费，
 * 保持与旧 AISettings 字段（baseUrl/apiKey/model/namingModel/maxTokens/temperature）兼容。
 */
export interface AISettings {
  /** 固定单例 ID（沿用 config.id） */
  id: number;
  // —— 主供应商连接 ——
  /** 当前激活供应商 ID */
  providerId: string;
  /** 当前激活供应商名称 */
  providerName: string;
  /** 主供应商接口基础地址 */
  baseUrl: string;
  /** 主供应商访问凭证 */
  apiKey: string;
  /** 主对话使用的模型标识 */
  model: string;
  /** 主供应商的模型清单（用于下拉展示） */
  modelList?: string[];
  /** 主供应商模型清单更新时间戳 */
  modelListUpdatedAt?: number;
  // —— 命名供应商连接（可不同于主供应商）——
  /** 命名供应商 ID（留空表示与主供应商相同） */
  namingProviderId?: string;
  /** 命名供应商名称 */
  namingProviderName?: string;
  /** 命名供应商接口基础地址 */
  namingBaseUrl?: string;
  /** 命名供应商访问凭证 */
  namingApiKey?: string;
  /** 命名使用的模型标识，留空回退主模型 */
  namingModel?: string;
  // —— 生成参数 ——
  /** 单次请求生成的最大上下文 Token 限制 */
  maxTokens?: number;
  /** 生成的随机性控制参数（0.0 ~ 2.0） */
  temperature?: number;
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
   * - 'research': 深度研究模式，多阶段数据采集与综合分析，产出论文级报告
   */
  mode?: 'plan' | 'act' | 'research';
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
  /** 思考（reasoning）耗时（毫秒），仅用于 UI 展示「已思考 Xs」 */
  reasoningTimeMs?: number;
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
  settings!: Table<AIConfig>;
  providers!: Table<Provider>;
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

    // 版本11：拆分 AI 配置——新增 providers 表，settings 由单份连接配置重构为运行时选择（AIConfig）
    // 旧的单例 settings（含 baseUrl/apiKey/modelList/provider）在升级时迁移为一条 provider + 新 config
    this.version(11).stores({
      providers: 'id, name, createdAt, order'
    }).upgrade(async tx => {
      const old = await tx.table('settings').get(1) as any;
      // 仅当旧记录存在连接信息且尚未迁移（无 activeProviderId）时执行迁移
      if (old && old.baseUrl && !old.activeProviderId) {
        const providerId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `prov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        await tx.table('providers').add({
          id: providerId,
          name: old.provider === 'custom' ? '自定义供应商' : '默认供应商',
          baseUrl: old.baseUrl,
          apiKey: old.apiKey || '',
          modelList: old.modelList,
          modelListUpdatedAt: old.modelListUpdatedAt,
          createdAt: now,
          order: now
        });
        await tx.table('settings').put({
          id: 1,
          activeProviderId: providerId,
          model: old.model || '',
          modelByProvider: { [providerId]: old.model || '' },
          namingProviderId: undefined,
          namingModel: old.namingModel,
          maxTokens: old.maxTokens,
          temperature: old.temperature
        });
      }
    });
  }
}

/** 
 * 暴露给全局的数据库单例实例，应用在初始化和运行时均依赖于此实例进行本地数据交互。
 */
export const db = new StudyStudioDB();
