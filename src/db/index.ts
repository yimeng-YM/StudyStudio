import Dexie, { Table } from 'dexie';

export interface Subject {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  lastAccessed?: number;
  order?: number;
}

export type EntityType = 'mindmap' | 'task' | 'note' | 'flashcard' | 'task_board' | 'file' | 'notes_overview' | 'quiz_bank';

export interface Entity {
  id: string;
  type: EntityType;
  subjectId: string;
  title: string;
  content: any;
  createdAt: number;
  updatedAt: number;
  lastAccessed?: number;
  order?: number;
  tags?: string[];
  chatSessionId?: string;
}

export interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  type: string; // 'related' | 'child' | 'reference'
  createdAt: number;
}

export interface AISettings {
  id: number;
  provider: 'openai' | 'gemini' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
  namingModel?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  entityId?: string;
  sourceType?: 'general' | 'mindmap' | 'note' | 'task';
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'system' | 'user' | 'assistant';
  content: any;
  createdAt: number;
}

export interface Attachment {
  id: string;
  data: string;
  mimeType: string;
  fileName: string;
  createdAt: number;
}

export class StudyStudioDB extends Dexie {
  subjects!: Table<Subject>;
  entities!: Table<Entity>;
  relations!: Table<Relation>;
  settings!: Table<AISettings>;
  chatSessions!: Table<ChatSession>;
  chatMessages!: Table<ChatMessage>;
  attachments!: Table<Attachment>;

  constructor() {
    super('StudyStudioDB');
    this.version(1).stores({
      subjects: 'id, name, createdAt',
      entities: 'id, type, subjectId, title, createdAt, updatedAt, *tags',
      relations: 'id, sourceId, targetId, type',
      settings: 'id'
    });

    this.version(2).stores({
      chatSessions: 'id, title, createdAt, updatedAt',
      chatMessages: 'id, sessionId, createdAt'
    });

    this.version(3).stores({
      chatSessions: 'id, title, entityId, createdAt, updatedAt'
    });

    this.version(4).stores({
      subjects: 'id, name, createdAt, lastAccessed, order',
      entities: 'id, type, subjectId, title, createdAt, updatedAt, lastAccessed, order, *tags'
    }).upgrade(async tx => {
      // Populate default values for existing subjects
      await tx.table('subjects').toCollection().modify(subject => {
        if (!subject.lastAccessed) subject.lastAccessed = subject.createdAt;
        if (subject.order === undefined) subject.order = subject.createdAt;
      });
      // Populate default values for existing entities
      await tx.table('entities').toCollection().modify(entity => {
        if (!entity.lastAccessed) entity.lastAccessed = entity.updatedAt || entity.createdAt;
        if (entity.order === undefined) entity.order = entity.createdAt;
      });
    });

    this.version(5).stores({
      attachments: 'id, createdAt'
    });

    this.version(6).stores({
      entities: 'id, type, subjectId, [subjectId+type], title, createdAt, updatedAt, lastAccessed, order, *tags'
    });

    this.version(7).stores({
      chatSessions: 'id, title, entityId, sourceType, createdAt, updatedAt'
    });
  }
}

export const db = new StudyStudioDB();
