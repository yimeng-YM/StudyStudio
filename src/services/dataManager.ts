import { db } from '@/db';
import 'dexie-export-import';

/**
 * 完整的数据导出结构定义。
 * 包含了当前数据库中的各个业务模块的集合数据，用于备份或跨设备迁移。
 */
export interface StudyStudioData {
  /** 导出数据的版本号，用于后续导入时的兼容性判断 */
  version: number;
  /** 数据导出的时间戳（毫秒） */
  timestamp: number;
  /** 学科数据集合 */
  subjects: any[];
  /** 实体（笔记、导图、题库等）数据集合 */
  entities: any[];
  /** 实体间的关联关系数据集合 */
  relations: any[];
  /** AI 聊天会话列表 */
  chatSessions: any[];
  /** AI 聊天消息记录集合 */
  chatMessages: any[];
  /** 缓存的附件和多媒体资源集合 */
  attachments: any[];
  /** AI 配置（接口地址、密钥、模型等） */
  config?: any[];
}

/**
 * 导出数据的过滤选项。
 * 允许用户选择性地仅导出部分学科或特定实体的数据。
 */
export interface ExportOptions {
  /** 指定要导出的学科 ID 列表 */
  subjectIds?: string[];
  /** 指定要导出的独立实体 ID 列表 */
  entityIds?: string[];
  /** 是否包含对话记录（默认 true） */
  includeChatHistory?: boolean;
  /** 是否包含 AI 配置（默认 false） */
  includeConfig?: boolean;
}

/**
 * 导入数据的过滤与选择参数。
 * 用于从已解析的备份文件中挑选特定的模块进行导入。
 */
export interface ImportSelection {
  /** 期望导入的学科 ID 列表 */
  subjectIds?: string[];
  /** 期望导入的实体 ID 列表 */
  entityIds?: string[];
  /** 是否导入对话记录（默认 true） */
  includeChatHistory?: boolean;
  /** 是否导入 AI 配置（默认 false） */
  includeConfig?: boolean;
  /** 导入配置时是否覆盖现有配置（默认 false = 跳过已有配置） */
  overwriteConfig?: boolean;
}

/**
 * 本地数据管理服务。
 * 提供整个应用数据的序列化导出、反序列化导入，以及智能的冲突处理和合并策略。
 */
export const DataManager = {
  /**
   * 将当前本地数据库中的数据抽取并组装为 JSON 对象。
   * 支持全量导出或基于特定学科/实体进行依赖追踪式的局部导出。
   *
   * @param options - 包含需要筛选导出的特定 ID 集合
   * @returns 组装好的全量或局部应用数据对象
   */
  async exportData(options?: ExportOptions): Promise<StudyStudioData> {
    const { subjectIds, entityIds: selectedEntityIds, includeChatHistory = true, includeConfig = false } = options || {};

    let subjects: any[], entities: any[], relations: any[], chatSessions: any[], chatMessages: any[], attachments: any[];

    if ((subjectIds && subjectIds.length > 0) || (selectedEntityIds && selectedEntityIds.length > 0)) {
      // 1. 抽取实体数据
      if (selectedEntityIds && selectedEntityIds.length > 0) {
        entities = await db.entities.where('id').anyOf(selectedEntityIds).toArray();
      } else if (subjectIds && subjectIds.length > 0) {
        entities = await db.entities.where('subjectId').anyOf(subjectIds).toArray();
      } else {
        entities = [];
      }

      const exportEntityIds = new Set(entities.map(e => e.id));
      const exportSubjectIds = new Set(subjectIds || []);
      entities.forEach(e => exportSubjectIds.add(e.subjectId));

      // 2. 抽取对应的学科数据
      subjects = await db.subjects.where('id').anyOf(Array.from(exportSubjectIds)).toArray();

      // 3. 抽取关系数据
      const allRelations = await db.relations.toArray();
      relations = allRelations.filter(r => exportEntityIds.has(r.sourceId) && exportEntityIds.has(r.targetId));

      // 4. 按选项决定是否导出对话记录
      if (includeChatHistory) {
        const allSessions = await db.chatSessions.toArray();
        chatSessions = allSessions;
        const sessionIds = new Set(chatSessions.map(s => s.id));
        const allMessages = await db.chatMessages.toArray();
        chatMessages = allMessages.filter(m => sessionIds.has(m.sessionId));
      } else {
        chatSessions = [];
        chatMessages = [];
      }

      // 5. 抽取附件数据
      attachments = await db.attachments.toArray();
    } else {
      // 未指定过滤条件，执行全量数据库导出
      subjects = await db.subjects.toArray();
      entities = await db.entities.toArray();
      relations = await db.relations.toArray();

      if (includeChatHistory) {
        chatSessions = await db.chatSessions.toArray();
        chatMessages = await db.chatMessages.toArray();
      } else {
        chatSessions = [];
        chatMessages = [];
      }

      attachments = await db.attachments.toArray();
    }

    // 6. 按选项决定是否导出 AI 配置
    const config = includeConfig ? await db.settings.toArray() : undefined;

    return {
      version: 2,
      timestamp: Date.now(),
      subjects,
      entities,
      relations,
      chatSessions,
      chatMessages,
      attachments,
      ...(config !== undefined && { config })
    };
  },

  /**
   * 将导出的 JSON 数据对象转换为 Blob，并触发浏览器的下载行为。
   *
   * @param options - 导出过滤参数
   */
  async downloadBackup(options?: ExportOptions) {
    try {
      const data = await this.exportData(options);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `studystudio-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出失败:', error);
      throw error;
    }
  },

  /**
   * 读取用户上传的备份文件，并解析校验其 JSON 格式是否合法。
   *
   * @param file - 用户选择的本地备份文件
   * @returns 解析后并通过基础校验的 StudyStudioData 对象
   */
  async parseImportFile(file: File): Promise<StudyStudioData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          if (!content) throw new Error('文件内容为空');
          const data = JSON.parse(content) as StudyStudioData;
          // 基础字段校验
          if (!data.subjects || !data.entities) {
            throw new Error('无效的数据格式');
          }
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  },

  /**
   * 核心的数据导入逻辑。
   * 采用智能合并模式，在遇到相同 ID 的数据时，会为其重新分配新 ID 并追加后缀，
   * 同时自动修复和重映射实体、关系以及聊天消息之间的层级和引用链路，确保导入后数据依然完整闭环。
   * 整个过程被包裹在 Dexie 事务中，以保证原子性。
   *
   * @param data - 解析好的待导入数据
   * @param selection - 用户勾选的指定导入项
   */
  async importStudyData(data: StudyStudioData, selection?: ImportSelection): Promise<void> {
    const { includeChatHistory = true, includeConfig = false, overwriteConfig = false } = selection || {};

    await db.transaction('rw', [db.subjects, db.entities, db.relations, db.chatSessions, db.chatMessages, db.attachments, db.settings], async () => {
      const idMap = new Map<string, string>();
      const timestamp = Date.now();
      const generateNewId = (oldId: string) => `${oldId}_imported_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;

      // 过滤出用户允许导入的学科数据
      const subjectsToImport = data.subjects.filter(s =>
        !selection?.subjectIds || selection.subjectIds.includes(s.id)
      );

      // 过滤出用户允许导入的实体数据
      const entitiesToImport = data.entities.filter(e =>
        (!selection?.entityIds || selection.entityIds.includes(e.id)) &&
        (!selection?.subjectIds || selection.subjectIds.includes(e.subjectId) || subjectsToImport.find(s => s.id === e.subjectId))
      );

      const importEntityIds = new Set(entitiesToImport.map(e => e.id));

      // 1. 处理并插入学科数据
      const newSubjects = [];
      for (const item of subjectsToImport) {
        const oldId = item.id;
        const existing = await db.subjects.get(oldId);
        if (existing) {
          const newId = generateNewId(oldId);
          idMap.set(oldId, newId);
          item.id = newId;
          item.name = `${item.name} (导入)`;
        }
        newSubjects.push(item);
      }
      await db.subjects.bulkAdd(newSubjects);

      // 2. 处理并插入实体数据，同时修复父学科引用
      const newEntities = [];
      for (const item of entitiesToImport) {
        const oldId = item.id;
        if (item.subjectId && idMap.has(item.subjectId)) {
          item.subjectId = idMap.get(item.subjectId);
        }
        const existing = await db.entities.get(oldId);
        if (existing) {
          const newId = generateNewId(oldId);
          idMap.set(oldId, newId);
          item.id = newId;
          item.title = `${item.title} (导入)`;
        }
        newEntities.push(item);
      }
      await db.entities.bulkAdd(newEntities);

      // 3. 处理实体间的关联关系
      if (data.relations) {
        const newRelations = [];
        for (const item of data.relations) {
          if (!importEntityIds.has(item.sourceId) || !importEntityIds.has(item.targetId)) continue;
          if (idMap.has(item.sourceId)) item.sourceId = idMap.get(item.sourceId);
          if (idMap.has(item.targetId)) item.targetId = idMap.get(item.targetId);
          const existing = await db.relations.get(item.id);
          if (existing) item.id = generateNewId(item.id);
          newRelations.push(item);
        }
        await db.relations.bulkAdd(newRelations);
      }

      // 4. 按选项决定是否导入对话记录
      if (includeChatHistory) {
        if (data.chatSessions) {
          const newSessions = [];
          for (const item of data.chatSessions) {
            const oldId = item.id;
            const existing = await db.chatSessions.get(oldId);
            if (existing) {
              const newId = generateNewId(oldId);
              idMap.set(oldId, newId);
              item.id = newId;
              item.title = `${item.title} (导入)`;
            }
            newSessions.push(item);
          }
          await db.chatSessions.bulkAdd(newSessions);
        }

        if (data.chatMessages) {
          const newMessages = [];
          for (const item of data.chatMessages) {
            if (!item.sessionId) continue;
            if (idMap.has(item.sessionId)) item.sessionId = idMap.get(item.sessionId);
            const existing = await db.chatMessages.get(item.id);
            if (existing) item.id = generateNewId(item.id);
            newMessages.push(item);
          }
          await db.chatMessages.bulkAdd(newMessages);
        }
      }

      // 5. 处理并插入多媒体附件
      if (data.attachments) {
        const newAttachments = [];
        for (const item of data.attachments) {
          const existing = await db.attachments.get(item.id);
          if (existing) item.id = generateNewId(item.id);
          newAttachments.push(item);
        }
        await db.attachments.bulkAdd(newAttachments);
      }

      // 6. 按选项决定是否导入 AI 配置
      if (includeConfig && data.config && data.config.length > 0) {
        if (overwriteConfig) {
          // 覆盖模式：直接 put（新增或替换）
          await db.settings.bulkPut(data.config);
        } else {
          // 跳过模式：仅在对应记录不存在时才写入
          for (const item of data.config) {
            const existing = await db.settings.get(item.id);
            if (!existing) {
              await db.settings.add(item);
            }
          }
        }
      }
    });
  },

  /**
   * 快捷导入入口，包含文件读取和数据写入全流程。
   *
   * @param file - 待导入的备份文件
   */
  async importData(file: File): Promise<void> {
    const data = await this.parseImportFile(file);
    await this.importStudyData(data);
  }
};
