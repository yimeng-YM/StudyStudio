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
    const { subjectIds, entityIds: selectedEntityIds } = options || {};
    
    let subjects: any[], entities: any[], relations: any[], chatSessions: any[], chatMessages: any[], attachments: any[];

    if ((subjectIds && subjectIds.length > 0) || (selectedEntityIds && selectedEntityIds.length > 0)) {
      // 1. 抽取实体数据
      if (selectedEntityIds && selectedEntityIds.length > 0) {
        // 如果指定了具体实体 ID，则严格按照列表导出
        entities = await db.entities.where('id').anyOf(selectedEntityIds).toArray();
      } else if (subjectIds && subjectIds.length > 0) {
        // 如果仅指定了学科 ID，则导出该学科下的所有实体
        entities = await db.entities.where('subjectId').anyOf(subjectIds).toArray();
      } else {
        entities = [];
      }
      
      const exportEntityIds = new Set(entities.map(e => e.id));
      const exportSubjectIds = new Set(subjectIds || []);
      // 确保实体所属的学科也被一并导出，维持外键完整性
      entities.forEach(e => exportSubjectIds.add(e.subjectId));

      // 2. 抽取对应的学科数据
      subjects = await db.subjects.where('id').anyOf(Array.from(exportSubjectIds)).toArray();

      // 3. 抽取关系数据（仅当关系的源和目标都在本次导出范围内时，才进行导出，避免断链）
      const allRelations = await db.relations.toArray();
      relations = allRelations.filter(r => exportEntityIds.has(r.sourceId) && exportEntityIds.has(r.targetId));

      // 4. 抽取聊天会话数据（目前采取全量导出策略）
      const allSessions = await db.chatSessions.toArray();
      chatSessions = allSessions;
      const sessionIds = new Set(chatSessions.map(s => s.id));

      // 5. 抽取聊天消息（仅导出属于上述会话的消息）
      const allMessages = await db.chatMessages.toArray();
      chatMessages = allMessages.filter(m => sessionIds.has(m.sessionId));

      // 6. 抽取附件数据（出于简化逻辑考虑，执行全量导出）
      attachments = await db.attachments.toArray();
    } else {
      // 未指定过滤条件，执行全量数据库导出
      subjects = await db.subjects.toArray();
      entities = await db.entities.toArray();
      relations = await db.relations.toArray();
      chatSessions = await db.chatSessions.toArray();
      chatMessages = await db.chatMessages.toArray();
      attachments = await db.attachments.toArray();
    }

    return {
      version: 2,
      timestamp: Date.now(),
      subjects,
      entities,
      relations,
      chatSessions,
      chatMessages,
      attachments
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
    await db.transaction('rw', [db.subjects, db.entities, db.relations, db.chatSessions, db.chatMessages, db.attachments], async () => {
      // 记录旧 ID 到新 ID 的映射，用于修复关系外键
      const idMap = new Map<string, string>();
      const timestamp = Date.now();
      // ID 冲突时的重新生成策略
      const generateNewId = (oldId: string) => `${oldId}_imported_${timestamp}_${Math.random().toString(36).substr(2, 5)}`;

      // 过滤出用户允许导入的学科数据
      const subjectsToImport = data.subjects.filter(s => 
        !selection?.subjectIds || selection.subjectIds.includes(s.id)
      );
      
      // 过滤出用户允许导入的实体数据，同时要求该实体所属学科也在导入列表中，或数据库中已存在
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
        
        // 若存在同名/同 ID 学科，则进行复制操作，避免覆盖现有数据
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
        
        // 如果父学科的 ID 发生了变更，则同步更新实体的外键
        if (item.subjectId && idMap.has(item.subjectId)) {
          item.subjectId = idMap.get(item.subjectId);
        }

        const existing = await db.entities.get(oldId);
        // 若本地已有相同实体，同样采用复制策略
        if (existing) {
          const newId = generateNewId(oldId);
          idMap.set(oldId, newId);
          item.id = newId;
          item.title = `${item.title} (导入)`;
        }
        newEntities.push(item);
      }
      await db.entities.bulkAdd(newEntities);

      // 3. 处理实体间的关联关系，修复引用的新 ID
      if (data.relations) {
        const newRelations = [];
        for (const item of data.relations) {
          // 如果关系的两端节点有任何一方未被导入，则直接舍弃该关系记录
          if (!importEntityIds.has(item.sourceId) || !importEntityIds.has(item.targetId)) continue;

          if (idMap.has(item.sourceId)) item.sourceId = idMap.get(item.sourceId);
          if (idMap.has(item.targetId)) item.targetId = idMap.get(item.targetId);

          const existing = await db.relations.get(item.id);
          if (existing) {
            item.id = generateNewId(item.id);
          }
          newRelations.push(item);
        }
        await db.relations.bulkAdd(newRelations);
      }

      // 4. 处理并插入 AI 会话记录
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

      // 5. 处理并插入聊天消息，确保消息依然挂载在正确的会话下
      if (data.chatMessages) {
        const newMessages = [];
        for (const item of data.chatMessages) {
          if (!item.sessionId) continue;
          
          let targetSessionId = item.sessionId;
          // 修复聊天消息对应的会话 ID
          if (idMap.has(item.sessionId)) {
            targetSessionId = idMap.get(item.sessionId);
          }
          item.sessionId = targetSessionId;

          const existing = await db.chatMessages.get(item.id);
          if (existing) {
            item.id = generateNewId(item.id);
          }
          newMessages.push(item);
        }
        await db.chatMessages.bulkAdd(newMessages);
      }

      // 6. 处理并插入多媒体附件
      if (data.attachments) {
        const newAttachments = [];
        for (const item of data.attachments) {
          const existing = await db.attachments.get(item.id);
          if (existing) {
            item.id = generateNewId(item.id);
          }
          newAttachments.push(item);
        }
        await db.attachments.bulkAdd(newAttachments);
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
