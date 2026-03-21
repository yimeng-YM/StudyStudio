import { db } from '@/db';

/**
 * 鲁棒的 AI 工具参数内容解析器。
 * 针对大模型在调用 function calling 时容易出现的 JSON 嵌套错误（例如画蛇添足地包裹了一层 `{ content: ... }` 或 `{ data: ... }`），
 * 进行递归的探底解析，确保最终拿到纯净的业务数据，提高 AI 容错率。
 * 
 * @param content - 原始的，可能被过度包裹或被二次 stringify 的 JSON 数据
 * @returns 解析后清洗干净的原始业务对象
 */
function robustParseContent(content: any): any {
  if (!content) return content;
  
  if (typeof content === 'object') {
    if (content.content !== undefined) {
      return robustParseContent(content.content);
    }
    if (content.data !== undefined) {
      return robustParseContent(content.data);
    }
  }
  
  if (typeof content === 'string' && (content.trim().startsWith('{') || content.trim().startsWith('['))) {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object') {
        return robustParseContent(parsed);
      }
    } catch (e) {
      // 无法被解析为 JSON 的纯文本，静默降级为普通字符串返回
    }
  }
  
  return content;
}

/**
 * 创建全新的学科。
 * 
 * @param args - 学科参数
 * @param args.name - 学科名称
 * @param args.description - 可选的学科描述
 * @returns 创建成功的学科 ID 与名称
 */
export const create_subject = async ({ name, description }: { name: string; description?: string }) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.subjects.add({
    id,
    name,
    description,
    createdAt: now,
    lastAccessed: now,
    order: now
  });
  return { id, name };
};

/**
 * 更新现有学科的基础信息。
 * 
 * @param args - 学科更新参数
 * @param args.subjectId - 目标学科 ID
 * @param args.name - 新名称
 * @param args.description - 新描述
 * @returns 更新后的学科元数据
 */
export const update_subject = async ({ subjectId, name, description }: { subjectId: string; name?: string; description?: string }) => {
  const subject = await db.subjects.get(subjectId);
  if (!subject) throw new Error(`找不到 ID 为 ${subjectId} 的学科`);
  
  if (name) subject.name = name;
  if (description) subject.description = description;
  
  await db.subjects.put(subject);
  return { id: subject.id, name: subject.name };
};

/**
 * 为指定学科创建思维导图。
 * 如果该学科下已存在思维导图，则将新生成的内容合并到现有导图中（通过计算节点坐标偏移防止重叠）。
 * 
 * @param args - 导图创建参数
 * @param args.subjectId - 归属学科 ID
 * @param args.title - 导图标题
 * @param args.content - 包含 React Flow nodes 和 edges 的序列化数据
 * @returns 导图实体 ID 及是否发生合并的标识
 */
export const create_mindmap = async ({ subjectId, title, content }: { subjectId: string; title: string; content: any }) => {
  const existing = await db.entities.where({ subjectId, type: 'mindmap' }).first();
  
  if (existing) {
    const currentContent = existing.content || { nodes: [], edges: [] };
    const newNodes = [...(currentContent.nodes || [])];
    const newEdges = [...(currentContent.edges || [])];

    // 计算当前画布最右侧坐标，新节点在此基础上向右平移 400 像素，避免挤占已有内容空间
    const maxX = newNodes.length > 0 ? Math.max(...newNodes.map(n => n.position?.x || 0)) : 0;
    
    const robustContent = robustParseContent(content);
    (robustContent.nodes || []).forEach((n: any) => {
      const idx = newNodes.findIndex(old => old.id === n.id);
      if (idx >= 0) newNodes[idx] = {
        ...n,
        position: {
          x: (n.position?.x || 0) + maxX + 400,
          y: n.position?.y || 0
        }
      };
      else newNodes.push({
        ...n,
        position: {
          x: (n.position?.x || 0) + maxX + 400,
          y: n.position?.y || 0
        }
      });
    });

    (robustContent.edges || []).forEach((e: any) => {
      const idx = newEdges.findIndex(old => old.id === e.id);
      if (idx >= 0) newEdges[idx] = e;
      else newEdges.push(e);
    });

    existing.content = { nodes: newNodes, edges: newEdges };
    existing.updatedAt = Date.now();
    await db.entities.put(existing);
    return { id: existing.id, title: existing.title, merged: true };
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await db.entities.add({
    id,
    type: 'mindmap',
    subjectId,
    title,
    content: robustParseContent(content),
    createdAt: now,
    updatedAt: now,
    lastAccessed: now,
    order: now
  });
  return { id, title, merged: false };
};

/**
 * 覆盖更新指定思维导图的整体结构。
 * 
 * @param args - 更新参数
 * @param args.entityId - 导图实体 ID
 * @param args.title - 新标题
 * @param args.content - 新的图元数据集合
 */
export const update_mindmap = async ({ entityId, title, content }: { entityId: string; title?: string; content?: any }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`找不到实体 ${entityId}`);
  if (entity.type !== 'mindmap') throw new Error(`实体 ${entityId} 不是思维导图`);
  
  if (title) entity.title = title;
  if (content !== undefined) entity.content = robustParseContent(content);
  entity.updatedAt = Date.now();
  
  await db.entities.put(entity);
  return { id: entity.id, title: entity.title };
};

/**
 * 向已存在的思维导图无缝追加指定的节点和连线。
 * 主要用于 AI 会话过程中的增量拓展，保留用户之前的修改。
 * 
 * @param args - 增量追加参数
 */
export const add_mindmap_elements = async ({ entityId, nodes, edges }: { entityId: string; nodes: any[]; edges: any[] }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`找不到实体 ${entityId}`);
  if (entity.type !== 'mindmap') throw new Error(`实体 ${entityId} 不是思维导图`);

  const currentContent = entity.content || { nodes: [], edges: [] };
  const newNodes = [...(currentContent.nodes || [])];
  const newEdges = [...(currentContent.edges || [])];

  nodes.forEach(n => {
    const idx = newNodes.findIndex(old => old.id === n.id);
    if (idx >= 0) newNodes[idx] = n;
    else newNodes.push(n);
  });

  edges.forEach(e => {
    const idx = newEdges.findIndex(old => old.id === e.id);
    if (idx >= 0) newEdges[idx] = e;
    else newEdges.push(e);
  });

  entity.content = { nodes: newNodes, edges: newEdges };
  entity.updatedAt = Date.now();
  await db.entities.put(entity);
  return { id: entity.id, nodesAdded: nodes.length, edgesAdded: edges.length };
};

/**
 * 创建学习笔记。
 * 特别处理了 AI 有时会将纯文本错误地放入 text 字段或过度转义的情况。
 * 
 * @param args - 笔记参数
 */
export const create_note = async ({ subjectId, title, content }: { subjectId: string; title: string; content: any }) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  
  const robustContent = robustParseContent(content);
  let actualContent = robustContent;
  if (robustContent && typeof robustContent === 'object' && robustContent.content && typeof robustContent.content === 'string') {
    actualContent = robustContent.content;
  } else if (robustContent && typeof robustContent === 'object' && robustContent.text && typeof robustContent.text === 'string') {
    actualContent = robustContent.text;
  } else if (robustContent && typeof robustContent !== 'string') {
    actualContent = JSON.stringify(robustContent, null, 2);
  }

  await db.entities.add({
    id,
    type: 'note',
    subjectId,
    title,
    content: actualContent,
    createdAt: now,
    updatedAt: now,
    lastAccessed: now,
    order: now
  });
  return { id, title };
};

/**
 * 更新现有笔记内容或标题。
 * 
 * @param args - 笔记更新参数
 */
export const update_note = async ({ entityId, title, content }: { entityId: string; title?: string; content?: any }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`找不到实体 ${entityId}`);
  if (entity.type !== 'note') throw new Error(`实体 ${entityId} 不是笔记`);
  
  if (title) entity.title = title;
  if (content !== undefined) {
    const robustContent = robustParseContent(content);
    let actualContent = robustContent;
    if (robustContent && typeof robustContent === 'object' && robustContent.content && typeof robustContent.content === 'string') {
      actualContent = robustContent.content;
    } else if (robustContent && typeof robustContent !== 'string') {
      actualContent = JSON.stringify(robustContent, null, 2);
    }
    entity.content = actualContent;
  }
  entity.updatedAt = Date.now();
  
  await db.entities.put(entity);
  return { id: entity.id, title: entity.title };
};

/**
 * 创建包含结构化题目的测验题库。
 * 
 * @param args - 题库参数
 */
export const create_quiz = async ({ subjectId, title, content }: { subjectId: string; title: string; content: any }) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.entities.add({
    id,
    type: 'quiz_bank',
    subjectId,
    title,
    content: robustParseContent(content),
    createdAt: now,
    updatedAt: now,
    lastAccessed: now,
    order: now
  });
  return { id, title };
};

/**
 * 更新测试题库内容。
 * 
 * @param args - 题库更新参数
 */
export const update_quiz = async ({ entityId, title, content }: { entityId: string; title?: string; content?: any }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`找不到实体 ${entityId}`);
  if (entity.type !== 'quiz_bank') throw new Error(`实体 ${entityId} 不是题库`);
  
  if (title) entity.title = title;
  if (content !== undefined) entity.content = robustParseContent(content);
  entity.updatedAt = Date.now();
  
  await db.entities.put(entity);
  return { id: entity.id, title: entity.title };
};

/**
 * 创建学习任务看板。
 * 包含类似创建导图的自动合并逻辑，当目标学科已存在看板时，将新节点向右追加排列。
 * 
 * @param args - 任务板参数
 */
export const create_taskboard = async ({ subjectId, title, content }: { subjectId: string; title: string; content: any }) => {
  const existing = await db.entities.where({ subjectId, type: 'task_board' }).first();
  
  if (existing) {
    const currentContent = existing.content || { nodes: [], edges: [] };
    const newNodes = [...(currentContent.nodes || [])];
    const newEdges = [...(currentContent.edges || [])];

    const maxX = newNodes.length > 0 ? Math.max(...newNodes.map(n => n.position?.x || 0)) : 0;
    
    const robustContent = robustParseContent(content);
    (robustContent.nodes || []).forEach((n: any) => {
      const idx = newNodes.findIndex(old => old.id === n.id);
      if (idx >= 0) newNodes[idx] = {
        ...n,
        position: {
          x: (n.position?.x || 0) + maxX + 400,
          y: n.position?.y || 0
        }
      };
      else newNodes.push({
        ...n,
        position: {
          x: (n.position?.x || 0) + maxX + 400,
          y: n.position?.y || 0
        }
      });
    });

    (robustContent.edges || []).forEach((e: any) => {
      const idx = newEdges.findIndex(old => old.id === e.id);
      if (idx >= 0) newEdges[idx] = e;
      else newEdges.push(e);
    });

    existing.content = { nodes: newNodes, edges: newEdges };
    existing.updatedAt = Date.now();
    await db.entities.put(existing);
    return { id: existing.id, title: existing.title, merged: true };
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await db.entities.add({
    id,
    type: 'task_board',
    subjectId,
    title,
    content: robustParseContent(content),
    createdAt: now,
    updatedAt: now,
    lastAccessed: now,
    order: now
  });
  return { id, title, merged: false };
};

/**
 * 覆盖更新任务看板结构。
 * 
 * @param args - 看板更新参数
 */
export const update_taskboard = async ({ entityId, title, content }: { entityId: string; title?: string; content?: any }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`找不到实体 ${entityId}`);
  if (entity.type !== 'task_board') throw new Error(`实体 ${entityId} 不是任务板`);
  
  if (title) entity.title = title;
  if (content !== undefined) entity.content = robustParseContent(content);
  entity.updatedAt = Date.now();
  
  await db.entities.put(entity);
  return { id: entity.id, title: entity.title };
};
