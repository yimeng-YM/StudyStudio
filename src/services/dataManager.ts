import { db } from '@/db';
import 'dexie-export-import';

export interface StudyStudioData {
  version: number;
  timestamp: number;
  subjects: any[];
  entities: any[];
  relations: any[];
  chatSessions: any[];
  chatMessages: any[];
  attachments: any[];
}

export interface ExportOptions {
  subjectIds?: string[];
}

export const DataManager = {
  /**
   * 导出数据为 JSON 对象
   */
  async exportData(options?: ExportOptions): Promise<StudyStudioData> {
    const { subjectIds } = options || {};
    
    let subjects, entities, relations, chatSessions, chatMessages, attachments;

    if (subjectIds && subjectIds.length > 0) {
      // 1. Subjects
      subjects = await db.subjects.where('id').anyOf(subjectIds).toArray();
      
      // 2. Entities
      entities = await db.entities.where('subjectId').anyOf(subjectIds).toArray();
      const entityIds = new Set(entities.map(e => e.id));

      // 3. Relations (仅导出两端都在选中实体内的关系)
      const allRelations = await db.relations.toArray();
      relations = allRelations.filter(r => entityIds.has(r.sourceId) && entityIds.has(r.targetId));

      // 4. Chat Sessions (仅导出关联到选中实体的会话)
      const allSessions = await db.chatSessions.toArray();
      chatSessions = allSessions.filter(s => s.entityId && entityIds.has(s.entityId));
      const sessionIds = new Set(chatSessions.map(s => s.id));

      // 5. Chat Messages
      const allMessages = await db.chatMessages.toArray();
      chatMessages = allMessages.filter(m => sessionIds.has(m.sessionId));

      // 6. Attachments (为安全起见，目前导出所有附件，避免解析内容的复杂性)
      attachments = await db.attachments.toArray();
    } else {
      // Full Export
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
   * 下载数据文件
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
      console.error('Export failed:', error);
      throw error;
    }
  },

  /**
   * 导入数据 (智能合并模式)
   * 遇到 ID 冲突时自动重命名并更新引用
   * @param file JSON 文件
   */
  async importData(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          if (!content) throw new Error('File is empty');
          
          const data = JSON.parse(content) as StudyStudioData;
          
          if (!data.subjects || !data.entities) {
            throw new Error('Invalid data format');
          }

          // Transaction to ensure atomicity
          await db.transaction('rw', [db.subjects, db.entities, db.relations, db.chatSessions, db.chatMessages, db.attachments], async () => {
            const idMap = new Map<string, string>();
            const timestamp = Date.now();
            const generateNewId = (oldId: string) => `${oldId}_imported_${timestamp}_${Math.random().toString(36).substr(2, 5)}`;

            // 1. Process Subjects
            const newSubjects = [];
            for (const item of data.subjects) {
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

            // 2. Process Entities
            const newEntities = [];
            for (const item of data.entities) {
              const oldId = item.id;
              
              // Remap Subject ID
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

            // 3. Process Relations
            if (data.relations) {
              const newRelations = [];
              for (const item of data.relations) {
                // Remap Source/Target
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

            // 4. Chat Sessions
            if (data.chatSessions) {
              const newSessions = [];
              for (const item of data.chatSessions) {
                if (item.entityId && idMap.has(item.entityId)) {
                  item.entityId = idMap.get(item.entityId);
                }

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

            // 5. Chat Messages
            if (data.chatMessages) {
              const newMessages = [];
              for (const item of data.chatMessages) {
                if (item.sessionId && idMap.has(item.sessionId)) {
                  item.sessionId = idMap.get(item.sessionId);
                }
                
                const existing = await db.chatMessages.get(item.id);
                if (existing) {
                  item.id = generateNewId(item.id);
                }
                newMessages.push(item);
              }
              await db.chatMessages.bulkAdd(newMessages);
            }

            // 6. Attachments
            if (data.attachments) {
              const newAttachments = [];
              for (const item of data.attachments) {
                const existing = await db.attachments.get(item.id);
                if (existing) {
                  // If ID conflict, check if content is same? 
                  // For now, simple remapping to be safe, though content-references inside entities won't be updated.
                  // Ideally attachments strictly use UUIDs.
                  item.id = generateNewId(item.id);
                }
                newAttachments.push(item);
              }
              await db.attachments.bulkAdd(newAttachments);
            }
          });

          resolve();
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
};
