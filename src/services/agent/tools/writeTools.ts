import { db } from '@/db';
import { generateUUID } from '@/lib/utils';

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
  const id = generateUUID();
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
 * 为指定学科创建一个全新的独立思维导图实体。
 * 每次调用均创建新实体，多个导图可在同一学科下共存，互不干扰。
 * 如需向已有导图追加内容，请使用 add_mindmap_elements；如需修改现有导图，请使用 update_mindmap。
 *
 * @param args.subjectId - 归属学科 ID
 * @param args.title - 导图标题
 * @param args.content - 包含 React Flow nodes 和 edges 的序列化数据
 * @returns 新创建的导图实体 ID 与标题
 */
export const create_mindmap = async ({ subjectId, title, content }: { subjectId: string; title: string; content: any }) => {
  const id = generateUUID();
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
    order: now,
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
  const id = generateUUID();
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
 * 返回 _diff 字段供前端展示改动对比视图（不会回传给 AI 上下文）。
 *
 * @param args - 笔记更新参数
 */
export const update_note = async ({ entityId, title, content }: { entityId: string; title?: string; content?: any }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`找不到实体 ${entityId}`);
  if (entity.type !== 'note') throw new Error(`实体 ${entityId} 不是笔记`);

  const oldContent = typeof entity.content === 'string' ? entity.content : '';
  let newContent: string | undefined;

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
    newContent = typeof actualContent === 'string' ? actualContent : '';
  }
  entity.updatedAt = Date.now();

  await db.entities.put(entity);
  return {
    id: entity.id,
    title: entity.title,
    ...(newContent !== undefined ? { _diff: { before: oldContent, after: newContent } } : {}),
  };
};

/**
 * 将题目数组格式化为易于 diff 对比的纯文本。
 * 每道题包含题型、题干、选项、答案和解析，用于在前端生成 diff 视图。
 */
function formatQuestionsAsText(questions: any[]): string {
  if (!Array.isArray(questions) || questions.length === 0) return '（空）';
  return questions.map((q: any, i: number) => {
    const parts: string[] = [`Q${i + 1}. [${q.type || '?'}] ${(q.text || '').replace(/\n/g, ' ')}`];
    if (Array.isArray(q.options) && q.options.length) {
      parts.push(`  选项: ${q.options.map((o: string, j: number) => `${String.fromCharCode(65 + j)}. ${o}`).join(' | ')}`);
    }
    parts.push(`  答案: ${Array.isArray(q.answer) ? q.answer.join(', ') : (q.answer ?? '')}`);
    if (q.explanation) parts.push(`  解析: ${String(q.explanation).replace(/\n/g, ' ')}`);
    return parts.join('\n');
  }).join('\n\n');
}

/**
 * 创建包含结构化题目的测验题库。
 *
 * @param args - 题库参数
 */
export const create_quiz = async ({ subjectId, title, content }: { subjectId: string; title: string; content: any }) => {
  const id = generateUUID();
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
 * 返回 _diff 字段供前端展示改动对比视图（不会回传给 AI 上下文）。
 *
 * @param args - 题库更新参数
 */
export const update_quiz = async ({ entityId, title, content }: { entityId: string; title?: string; content?: any }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`找不到实体 ${entityId}`);
  if (entity.type !== 'quiz_bank') throw new Error(`实体 ${entityId} 不是题库`);

  const oldQuestions = Array.isArray(entity.content?.questions) ? [...entity.content.questions] : [];

  if (title) entity.title = title;
  if (content !== undefined) entity.content = robustParseContent(content);
  entity.updatedAt = Date.now();

  await db.entities.put(entity);
  const newQuestions = Array.isArray(entity.content?.questions) ? entity.content.questions : [];
  return {
    id: entity.id,
    title: entity.title,
    _diff: { before: formatQuestionsAsText(oldQuestions), after: formatQuestionsAsText(newQuestions) },
  };
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

  const id = generateUUID();
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
 * 通过「精确搜索→替换」的方式修改笔记中的局部内容，无需依赖行号。
 *
 * 相比基于行号的方案，此方式具有以下优势：
 *  - 定位不会因多次连续 patch 而错位（行号会随每次修改漂移，但文本内容不会）
 *  - AI 只需从读取结果中复制原文即可，无需计算行号
 *  - 未找到原文时立即报错，不会静默地改错位置
 *
 * @param args.entityId - 笔记实体 ID
 * @param args.search   - 待替换的原始文本（须与笔记内容完全一致，含空格与换行）
 * @param args.replace  - 替换后的新文本
 *
 * @throws 当 search 文本在笔记中不存在时抛出错误
 * @throws 当 search 文本在笔记中出现多次（有歧义）时抛出错误，要求提供更多上下文
 */
export const patch_note_content = async ({
  entityId,
  search,
  replace,
}: {
  entityId: string;
  search: string;
  replace: string;
}) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`未找到实体 ${entityId}`);
  if (entity.type !== 'note') throw new Error(`实体 ${entityId} 不是笔记`);

  const content = typeof entity.content === 'string' ? entity.content : '';

  // 精确匹配（含所有空白字符与换行），不使用正则，避免特殊字符误匹配
  if (!content.includes(search)) {
    throw new Error(
      `未在笔记中找到指定文本。请通过 get_entity_content 重新读取最新内容，` +
      `确保 search 参数与原文完全一致（含空格、标点、换行）。`
    );
  }

  const occurrences = content.split(search).length - 1;
  if (occurrences > 1) {
    throw new Error(
      `指定文本在笔记中出现了 ${occurrences} 次，无法唯一定位。` +
      `请在 search 参数中包含更多上下文（如前后各多加一行）以确保唯一性。`
    );
  }

  const newContent = content.replace(search, replace);
  entity.content = newContent;
  entity.updatedAt = Date.now();
  await db.entities.put(entity);

  return {
    id: entity.id,
    title: entity.title,
    _diff: { before: search, after: replace },
  };
};

/**
 * 对题库中的题目进行精细化增删改操作，无需重写全部题目。
 * 每个操作项可独立指定类型（add / update / delete）及目标题目。
 *
 * @param args.entityId - 题库实体 ID
 * @param args.operations - 操作列表，每项包含：
 *   - type: 'add' | 'update' | 'delete'
 *   - question_id: 'update'/'delete' 时必填，要操作的题目 id
 *   - question: 'add' 时为完整题目对象；'update' 时为需要合并的字段（可部分更新）
 */
export const patch_quiz_questions = async ({
  entityId,
  operations,
}: {
  entityId: string;
  operations: Array<{
    type: 'add' | 'update' | 'delete';
    question_id?: string;
    question?: any;
  }>;
}) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`未找到实体 ${entityId}`);
  if (entity.type !== 'quiz_bank') throw new Error(`实体 ${entityId} 不是题库`);

  const content = entity.content || { questions: [] };
  const questions: any[] = [...(content.questions || [])];
  const stats = { added: 0, updated: 0, deleted: 0 };

  // 操作前：快照所有将被 update/delete 的题目（用于 diff 的 before 侧）
  const beforeSnapshotById: Record<string, any> = {};
  for (const op of operations) {
    if ((op.type === 'update' || op.type === 'delete') && op.question_id) {
      const q = questions.find((q: any) => q.id === op.question_id);
      if (q) beforeSnapshotById[op.question_id] = { ...q };
    }
  }

  for (const op of operations) {
    if (op.type === 'add' && op.question) {
      questions.push(op.question);
      stats.added++;
    } else if (op.type === 'update' && op.question_id && op.question) {
      const idx = questions.findIndex((q: any) => q.id === op.question_id);
      if (idx >= 0) {
        questions[idx] = { ...questions[idx], ...op.question };
        stats.updated++;
      }
    } else if (op.type === 'delete' && op.question_id) {
      const idx = questions.findIndex((q: any) => q.id === op.question_id);
      if (idx >= 0) {
        questions.splice(idx, 1);
        stats.deleted++;
      }
    }
  }

  // 操作后：收集 diff 的 before/after 内容
  const diffBefore: any[] = [];
  const diffAfter: any[] = [];
  for (const op of operations) {
    if (op.type === 'delete' && op.question_id && beforeSnapshotById[op.question_id]) {
      diffBefore.push(beforeSnapshotById[op.question_id]);
    } else if (op.type === 'update' && op.question_id) {
      if (beforeSnapshotById[op.question_id]) diffBefore.push(beforeSnapshotById[op.question_id]);
      const updated = questions.find((q: any) => q.id === op.question_id);
      if (updated) diffAfter.push(updated);
    } else if (op.type === 'add' && op.question) {
      const added = questions.find((q: any) => q.id === op.question?.id) ?? op.question;
      diffAfter.push(added);
    }
  }

  entity.content = { ...content, questions };
  entity.updatedAt = Date.now();
  await db.entities.put(entity);

  return {
    id: entity.id,
    title: entity.title,
    ...stats,
    total_questions: questions.length,
    _diff: { before: formatQuestionsAsText(diffBefore), after: formatQuestionsAsText(diffAfter) },
  };
};

/**
 * 清空指定思维导图的全部节点与连线，保留实体元数据（ID、标题等）。
 * 适用于需要重新规划导图结构但不想删除实体本身的场景。
 *
 * @param args.entityId - 思维导图实体 ID
 */
export const clear_mindmap = async ({ entityId }: { entityId: string }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`找不到实体 ${entityId}`);
  if (entity.type !== 'mindmap') throw new Error(`实体 ${entityId} 不是思维导图`);

  entity.content = { nodes: [], edges: [] };
  entity.updatedAt = Date.now();
  await db.entities.put(entity);
  return { id: entity.id, title: entity.title, cleared: true };
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
