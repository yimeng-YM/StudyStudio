import { db, Entity, Relation } from '@/db';
import { generateUUID } from '@/lib/utils';

export const MINDMAP_NOTE_RELATION = 'mindmap_node_note';
export const MINDMAP_TASK_RELATION = 'mindmap_node_task';

interface MindMapRelationMetadata extends Record<string, unknown> {
  sourceNodeId: string;
  targetBlockId?: string;
  targetItemIds?: string[];
}

export interface TaskItemOrigin extends Record<string, unknown> {
  type: 'mindmap_node' | 'legacy_task';
  sourceNodeId?: string;
  legacyEntityId?: string;
}

export interface StoredTaskItem extends Record<string, unknown> {
  id: string;
  text: string;
  completed: boolean;
  origin?: TaskItemOrigin;
}

export interface StoredTaskBlockData extends Record<string, unknown> {
  title: string;
  items: StoredTaskItem[];
  origin?: TaskItemOrigin;
  legacyTaskBlock?: boolean;
}

export interface StoredTaskBoardNode extends Record<string, unknown> {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: StoredTaskBlockData;
}

export interface TaskBoardContent extends Record<string, unknown> {
  nodes: StoredTaskBoardNode[];
  edges: Record<string, unknown>[];
}

export interface MindMapTaskInput {
  nodeId: string;
  text: string;
}

export interface AddMindMapTasksResult {
  boardId: string;
  blockId: string;
  itemIds: string[];
  addedCount: number;
  recoveredLegacyLinks: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function relationNodeId(relation: Relation): string | undefined {
  const metadata = relation.metadata;
  if (!metadata) return undefined;
  const sourceNodeId = metadata.sourceNodeId ?? metadata.nodeId;
  return typeof sourceNodeId === 'string' ? sourceNodeId : undefined;
}

function normalizeTaskItem(value: unknown): StoredTaskItem {
  if (typeof value === 'string') {
    return { id: generateUUID(), text: value, completed: false };
  }

  const raw = isRecord(value) ? value : {};
  const textCandidate = raw.text ?? raw.title ?? raw.label;
  const status = raw.status;
  const origin = isRecord(raw.origin) ? raw.origin as TaskItemOrigin : undefined;

  return {
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateUUID(),
    text: typeof textCandidate === 'string' ? textCandidate : '',
    completed: typeof raw.completed === 'boolean'
      ? raw.completed
      : status === 'done' || status === 'completed',
    ...(origin ? { origin } : {}),
  };
}

/**
 * 将历史任务看板和 AI 生成的宽松结构规整为当前 React Flow 任务看板结构。
 * 会保留未知字段，避免在保存时误删旧版本或未来版本的扩展数据。
 */
export function normalizeTaskBoardContent(value: unknown): TaskBoardContent {
  const raw = isRecord(value) ? value : {};
  const directItems = Array.isArray(value)
    ? value
    : Array.isArray(raw.tasks)
      ? raw.tasks
      : Array.isArray(raw.items)
        ? raw.items
        : null;

  const rawNodes = Array.isArray(raw.nodes)
    ? raw.nodes
    : directItems
      ? [{
          id: generateUUID(),
          type: 'taskBlock',
          position: { x: 100, y: 100 },
          data: { title: '待办事项', items: directItems },
        }]
      : [];

  const nodes = rawNodes.map((valueNode, index) => {
    const node = isRecord(valueNode) ? valueNode : {};
    const rawData = isRecord(node.data) ? node.data : node;
    const rawPosition = isRecord(node.position) ? node.position : {};
    const rawItems = Array.isArray(rawData.items) ? rawData.items : [];
    const origin = isRecord(rawData.origin) ? rawData.origin as TaskItemOrigin : undefined;

    return {
      ...node,
      id: typeof node.id === 'string' && node.id ? node.id : generateUUID(),
      type: 'taskBlock',
      position: {
        x: typeof rawPosition.x === 'number' ? rawPosition.x : 100 + index * 340,
        y: typeof rawPosition.y === 'number' ? rawPosition.y : 100,
      },
      data: {
        ...rawData,
        title: typeof rawData.title === 'string' && rawData.title ? rawData.title : '未命名任务清单',
        items: rawItems.map(normalizeTaskItem),
        ...(origin ? { origin } : {}),
      },
    } satisfies StoredTaskBoardNode;
  });

  const edges = Array.isArray(raw.edges)
    ? raw.edges.filter(isRecord).map(edge => ({ ...edge }))
    : [];

  return { ...raw, nodes, edges };
}

function taskBoardNeedsNormalization(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return true;

  return value.nodes.some(valueNode => {
    if (!isRecord(valueNode) || typeof valueNode.id !== 'string' || valueNode.type !== 'taskBlock') return true;
    if (!isRecord(valueNode.position)
      || typeof valueNode.position.x !== 'number'
      || typeof valueNode.position.y !== 'number') return true;
    if (!isRecord(valueNode.data)
      || typeof valueNode.data.title !== 'string'
      || !Array.isArray(valueNode.data.items)) return true;

    return valueNode.data.items.some(item =>
      !isRecord(item)
      || typeof item.id !== 'string'
      || typeof item.text !== 'string'
      || typeof item.completed !== 'boolean'
    );
  });
}

/** 仅移除运行时注入的回调，保留来源关系等持久化字段。 */
export function stripTaskNodeHandlers(data: Record<string, unknown>): StoredTaskBlockData {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => typeof value !== 'function')
  ) as StoredTaskBlockData;
}

function selectCanonicalBoard(boards: Entity[]): Entity | null {
  if (boards.length === 0) return null;
  return [...boards].sort((a, b) =>
    a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  )[0];
}

function hasLegacyTask(content: TaskBoardContent, legacyTaskId: string): boolean {
  return content.nodes.some(node => node.data.items.some(item =>
    item.id === legacyTaskId
    || (item.origin?.type === 'legacy_task' && item.origin.legacyEntityId === legacyTaskId)
  ));
}

async function ensureTaskBoardRecord(subjectId: string, createIfMissing: boolean): Promise<Entity | null> {
  const [boards, legacyTasks] = await Promise.all([
    db.entities.where({ subjectId, type: 'task_board' }).toArray(),
    db.entities.where({ subjectId, type: 'task' }).toArray(),
  ]);

  let board = selectCanonicalBoard(boards);
  if (!board && !createIfMissing && legacyTasks.length === 0) return null;

  const now = Date.now();
  if (!board) {
    board = {
      id: generateUUID(),
      subjectId,
      type: 'task_board',
      title: 'Task Board',
      content: { nodes: [], edges: [] },
      createdAt: now,
      updatedAt: now,
      lastAccessed: now,
      order: now,
    };
  }

  const requiresNormalization = taskBoardNeedsNormalization(board.content);
  const content = normalizeTaskBoardContent(board.content);
  const missingLegacyTasks = legacyTasks.filter(task => !hasLegacyTask(content, task.id));

  if (missingLegacyTasks.length > 0) {
    let legacyBlock = content.nodes.find(node => node.data.legacyTaskBlock === true);
    if (!legacyBlock) {
      legacyBlock = {
        id: generateUUID(),
        type: 'taskBlock',
        position: { x: 100, y: 100 },
        data: { title: '待办事项', items: [], legacyTaskBlock: true },
      };
      content.nodes.push(legacyBlock);
    }

    const migratedItems = missingLegacyTasks.map(task => normalizeTaskItem({
      id: task.id,
      text: task.title,
      completed: task.content?.completed === true
        || task.content?.status === 'done'
        || task.content?.status === 'completed',
      origin: { type: 'legacy_task', legacyEntityId: task.id },
    }));
    legacyBlock.data.items = [...legacyBlock.data.items, ...migratedItems];
  }

  const isNew = !boards.some(candidate => candidate.id === board?.id);

  if (isNew) {
    board.content = content;
    await db.entities.add(board);
  } else if (missingLegacyTasks.length > 0 || requiresNormalization) {
    const updatedAt = Date.now();
    board = { ...board, content, updatedAt };
    await db.entities.update(board.id, { content, updatedAt });
  }

  return { ...board, content };
}

/**
 * 读取一个学科的规范任务看板。若仍存在旧版独立 task 实体，会幂等迁移到看板；
 * 旧实体保留以保证数据可恢复，但不会重复生成任务项。
 */
export async function getTaskBoardForSubject(
  subjectId: string,
  createIfMissing = false,
): Promise<Entity | null> {
  return db.transaction('rw', db.entities, () => ensureTaskBoardRecord(subjectId, createIfMissing));
}

export async function getLinkedNote(
  mindMapId: string,
  sourceNodeId: string,
  subjectId: string,
): Promise<Entity | null> {
  const relations = await db.relations.where('sourceId').equals(mindMapId).toArray();
  const candidates = relations
    .filter(relation => relation.type === MINDMAP_NOTE_RELATION && relationNodeId(relation) === sourceNodeId)
    .sort((a, b) => b.createdAt - a.createdAt);

  for (const relation of candidates) {
    const note = await db.entities.get(relation.targetId);
    if (note?.type === 'note' && note.subjectId === subjectId) return note;
    await db.relations.delete(relation.id);
  }

  return null;
}

export async function linkMindMapNodeToNote(
  mindMapId: string,
  sourceNodeId: string,
  noteId: string,
  subjectId: string,
): Promise<Entity> {
  return db.transaction('rw', [db.entities, db.relations], async () => {
    const [mindMap, note] = await Promise.all([
      db.entities.get(mindMapId),
      db.entities.get(noteId),
    ]);
    if (mindMap?.type !== 'mindmap' || mindMap.subjectId !== subjectId) {
      throw new Error('当前思维导图不存在或不属于此学科');
    }
    if (note?.type !== 'note' || note.subjectId !== subjectId) {
      throw new Error('所选笔记不存在或不属于此学科');
    }

    const existing = await db.relations.where('sourceId').equals(mindMapId).toArray();
    const oldIds = existing
      .filter(relation => relation.type === MINDMAP_NOTE_RELATION && relationNodeId(relation) === sourceNodeId)
      .map(relation => relation.id);
    if (oldIds.length > 0) await db.relations.bulkDelete(oldIds);

    await db.relations.add({
      id: generateUUID(),
      sourceId: mindMapId,
      targetId: noteId,
      type: MINDMAP_NOTE_RELATION,
      metadata: { sourceNodeId } satisfies MindMapRelationMetadata,
      createdAt: Date.now(),
    });
    return note;
  });
}

export async function createAndLinkMindMapNote(
  mindMapId: string,
  sourceNodeId: string,
  subjectId: string,
  title: string,
): Promise<Entity> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error('笔记标题不能为空');

  const now = Date.now();
  const note: Entity = {
    id: generateUUID(),
    subjectId,
    type: 'note',
    title: trimmedTitle,
    content: '',
    createdAt: now,
    updatedAt: now,
    lastAccessed: now,
    order: now,
  };

  await db.transaction('rw', [db.entities, db.relations], async () => {
    const mindMap = await db.entities.get(mindMapId);
    if (mindMap?.type !== 'mindmap' || mindMap.subjectId !== subjectId) {
      throw new Error('当前思维导图不存在或不属于此学科');
    }
    await db.entities.add(note);

    const existing = await db.relations.where('sourceId').equals(mindMapId).toArray();
    const oldIds = existing
      .filter(relation => relation.type === MINDMAP_NOTE_RELATION && relationNodeId(relation) === sourceNodeId)
      .map(relation => relation.id);
    if (oldIds.length > 0) await db.relations.bulkDelete(oldIds);
    await db.relations.add({
      id: generateUUID(),
      sourceId: mindMapId,
      targetId: note.id,
      type: MINDMAP_NOTE_RELATION,
      metadata: { sourceNodeId } satisfies MindMapRelationMetadata,
      createdAt: now,
    });
  });

  return note;
}

/** 解除一篇笔记与所有思维导图节点的关联，不删除笔记本身。 */
export async function unlinkNoteFromMindMaps(noteId: string): Promise<number> {
  return db.transaction('rw', db.relations, async () => {
    const relations = await db.relations.where('targetId').equals(noteId).toArray();
    const relationIds = relations
      .filter(relation => relation.type === MINDMAP_NOTE_RELATION)
      .map(relation => relation.id);
    if (relationIds.length > 0) await db.relations.bulkDelete(relationIds);
    return relationIds.length;
  });
}

/** 删除实体时同步清理其作为关系源或目标产生的孤儿记录。 */
export async function deleteEntityAndRelations(entityId: string): Promise<void> {
  await db.transaction('rw', [db.entities, db.relations], async () => {
    const [outgoing, incoming] = await Promise.all([
      db.relations.where('sourceId').equals(entityId).primaryKeys(),
      db.relations.where('targetId').equals(entityId).primaryKeys(),
    ]);
    const relationIds = [...new Set([...outgoing, ...incoming])];
    if (relationIds.length > 0) await db.relations.bulkDelete(relationIds);
    await db.entities.delete(entityId);
  });
}

async function upsertTaskRelation(
  mindMapId: string,
  sourceNodeId: string,
  boardId: string,
  blockId: string,
  itemIds: string[],
): Promise<void> {
  const relations = await db.relations.where('sourceId').equals(mindMapId).toArray();
  const existing = relations.find(relation =>
    relation.type === MINDMAP_TASK_RELATION
    && relation.targetId === boardId
    && relationNodeId(relation) === sourceNodeId
    && relation.metadata?.targetBlockId === blockId
  );
  const currentItemIds = Array.isArray(existing?.metadata?.targetItemIds)
    ? existing.metadata.targetItemIds.filter((id): id is string => typeof id === 'string')
    : [];
  const targetItemIds = [...new Set([...currentItemIds, ...itemIds])];
  const metadata: MindMapRelationMetadata = { sourceNodeId, targetBlockId: blockId, targetItemIds };

  if (existing) {
    await db.relations.update(existing.id, { metadata });
  } else {
    await db.relations.add({
      id: generateUUID(),
      sourceId: mindMapId,
      targetId: boardId,
      type: MINDMAP_TASK_RELATION,
      metadata,
      createdAt: Date.now(),
    });
  }
}

/** 删除任务项时，从关系元数据中移除对应任务 ID；关系不再包含任务时一并删除。 */
export async function unlinkMindMapTaskItems(
  boardId: string,
  blockId: string,
  deletedItems: Array<Pick<StoredTaskItem, 'id' | 'origin'>>,
): Promise<number> {
  if (deletedItems.length === 0) return 0;

  const deletedItemIds = new Set(deletedItems.map(item => item.id));
  const deletedSourceNodeIds = new Set(
    deletedItems
      .map(item => item.origin?.sourceNodeId)
      .filter((nodeId): nodeId is string => typeof nodeId === 'string')
  );

  return db.transaction('rw', db.relations, async () => {
    const relations = await db.relations.where('targetId').equals(boardId).toArray();
    let changedCount = 0;

    for (const relation of relations) {
      if (relation.type !== MINDMAP_TASK_RELATION || relation.metadata?.targetBlockId !== blockId) continue;

      const currentItemIds = Array.isArray(relation.metadata.targetItemIds)
        ? relation.metadata.targetItemIds.filter((id): id is string => typeof id === 'string')
        : [];
      if (currentItemIds.length === 0) {
        const sourceNodeId = relationNodeId(relation);
        if (sourceNodeId && deletedSourceNodeIds.has(sourceNodeId)) {
          await db.relations.delete(relation.id);
          changedCount += 1;
        }
        continue;
      }

      const remainingItemIds = currentItemIds.filter(itemId => !deletedItemIds.has(itemId));
      if (remainingItemIds.length === currentItemIds.length) continue;

      if (remainingItemIds.length === 0) {
        await db.relations.delete(relation.id);
      } else {
        await db.relations.update(relation.id, {
          metadata: { ...relation.metadata, targetItemIds: remainingItemIds },
        });
      }
      changedCount += 1;
    }

    return changedCount;
  });
}

/** 删除任务块时解除所有指向这些块的思维导图关系。 */
export async function unlinkMindMapTaskBlocks(
  boardId: string,
  blockIds: string[],
): Promise<number> {
  if (blockIds.length === 0) return 0;
  const deletedBlockIds = new Set(blockIds);

  return db.transaction('rw', db.relations, async () => {
    const relations = await db.relations.where('targetId').equals(boardId).toArray();
    const relationIds = relations
      .filter(relation =>
        relation.type === MINDMAP_TASK_RELATION
        && typeof relation.metadata?.targetBlockId === 'string'
        && deletedBlockIds.has(relation.metadata.targetBlockId)
      )
      .map(relation => relation.id);
    if (relationIds.length > 0) await db.relations.bulkDelete(relationIds);
    return relationIds.length;
  });
}

/**
 * 把导图分支写入任务看板，并同时建立可导出/导入的节点级关系。
 * 事务内重新读取最新看板，避免模态框打开后任务数据变化造成覆盖。
 */
export async function addMindMapTasksToBoard(args: {
  subjectId: string;
  mindMapId: string;
  sourceNodeId: string;
  targetBlockId: string | 'new';
  newBlockTitle: string;
  items: MindMapTaskInput[];
}): Promise<AddMindMapTasksResult> {
  const { subjectId, mindMapId, sourceNodeId, targetBlockId, newBlockTitle } = args;
  const items = args.items
    .map(item => ({ ...item, text: item.text.trim() }))
    .filter(item => item.text.length > 0);
  if (items.length === 0) throw new Error('没有可添加的任务项');

  return db.transaction('rw', [db.entities, db.relations], async () => {
    const mindMap = await db.entities.get(mindMapId);
    if (mindMap?.type !== 'mindmap' || mindMap.subjectId !== subjectId) {
      throw new Error('当前思维导图不存在或不属于此学科');
    }

    const board = await ensureTaskBoardRecord(subjectId, true);
    if (!board) throw new Error('无法创建任务看板');
    const content = normalizeTaskBoardContent(board.content);

    let block = targetBlockId === 'new'
      ? null
      : content.nodes.find(node => node.id === targetBlockId) ?? null;
    if (targetBlockId !== 'new' && !block) {
      throw new Error('目标任务清单已不存在，请重新选择');
    }

    let recoveredLegacyLinks = false;
    if (!block) {
      block = content.nodes.find(node =>
        node.data.origin?.type === 'mindmap_node'
        && node.data.origin.sourceNodeId === sourceNodeId
      ) ?? null;

      if (!block) {
        const exactTitleBlock = content.nodes.find(node =>
          node.data.title.trim() === newBlockTitle.trim()
          && items.every(item => node.data.items.some(task => task.text.trim() === item.text))
        );
        if (exactTitleBlock) {
          block = exactTitleBlock;
          recoveredLegacyLinks = true;
        }
      }
    }

    if (!block) {
      block = {
        id: generateUUID(),
        type: 'taskBlock',
        position: {
          x: content.nodes.length > 0
            ? Math.max(...content.nodes.map(node => node.position.x)) + 340
            : 100,
          y: 100,
        },
        data: {
          title: newBlockTitle.trim() || '新任务清单',
          items: [],
          origin: { type: 'mindmap_node', sourceNodeId },
        },
      };
      content.nodes.push(block);
    } else if (!block.data.origin && targetBlockId === 'new') {
      block.data.origin = { type: 'mindmap_node', sourceNodeId };
    }

    const resolvedItems: { sourceNodeId: string; item: StoredTaskItem; added: boolean }[] = [];
    for (const item of items) {
      let storedItem = block.data.items.find(task =>
        task.origin?.type === 'mindmap_node' && task.origin.sourceNodeId === item.nodeId
      );
      if (!storedItem) {
        storedItem = block.data.items.find(task => !task.origin && task.text.trim() === item.text);
        if (storedItem) recoveredLegacyLinks = true;
      }

      if (storedItem) {
        storedItem.text = item.text;
        storedItem.origin = { type: 'mindmap_node', sourceNodeId: item.nodeId };
        resolvedItems.push({ sourceNodeId: item.nodeId, item: storedItem, added: false });
      } else {
        storedItem = {
          id: generateUUID(),
          text: item.text,
          completed: false,
          origin: { type: 'mindmap_node', sourceNodeId: item.nodeId },
        };
        block.data.items.push(storedItem);
        resolvedItems.push({ sourceNodeId: item.nodeId, item: storedItem, added: true });
      }
    }

    const now = Date.now();
    await db.entities.update(board.id, { content, updatedAt: now });

    const itemIds = resolvedItems.map(result => result.item.id);
    await upsertTaskRelation(mindMapId, sourceNodeId, board.id, block.id, itemIds);
    for (const result of resolvedItems) {
      await upsertTaskRelation(mindMapId, result.sourceNodeId, board.id, block.id, [result.item.id]);
    }

    return {
      boardId: board.id,
      blockId: block.id,
      itemIds,
      addedCount: resolvedItems.filter(result => result.added).length,
      recoveredLegacyLinks,
    };
  });
}
