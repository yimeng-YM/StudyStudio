import { db } from '@/db';
import { generateUUID } from '@/lib/utils';
import { ToolError } from './toolError';
import {
  buildLineOffsets,
  offsetToLineCol,
  lineText,
  resolveLineRange,
  regionForRange,
  findOccurrences,
  computeNearestMatch,
  compileSearchRegex,
  similarityRatio,
  type LineRange,
  type Occurrence,
} from './noteTextUtils';
import { deleteEntityAndRelations } from '@/services/studyLinks';

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
 * 为指定学科创建全新的思维导图实体。
 * 若该学科下已存在思维导图，则自动将新节点和连线合并入已有导图（避免产生多份数据），
 * 新增节点会向右偏移以避免与现有内容重叠。
 * 如需向已有导图追加内容，也可直接使用 add_mindmap_elements；如需整体替换，请使用 update_mindmap。
 *
 * @param args.subjectId - 归属学科 ID
 * @param args.title - 导图标题
 * @param args.content - 包含 React Flow nodes 和 edges 的序列化数据
 * @returns 导图实体 ID 与标题，merged 字段标识是否合并到已有导图
 */
export const create_mindmap = async ({ subjectId, title, content }: { subjectId: string; title: string; content: any }) => {
  const existing = await db.entities.where({ subjectId, type: 'mindmap' }).first();

  if (existing) {
    const currentContent = existing.content || { nodes: [], edges: [] };
    const newNodes = [...(currentContent.nodes || [])];
    const newEdges = [...(currentContent.edges || [])];

    const maxX = newNodes.length > 0 ? Math.max(...newNodes.map((n: any) => n.position?.x || 0)) : 0;
    const offsetX = maxX + 400;

    const robustContent = robustParseContent(content);
    (robustContent.nodes || []).forEach((n: any) => {
      const idx = newNodes.findIndex((old: any) => old.id === n.id);
      if (idx >= 0) {
        newNodes[idx] = {
          ...n,
          position: {
            x: offsetX,
            y: n.position?.y || 0
          }
        };
      } else {
        newNodes.push({
          ...n,
          position: {
            x: offsetX,
            y: n.position?.y || 0
          }
        });
      }
    });

    (robustContent.edges || []).forEach((e: any) => {
      const idx = newEdges.findIndex((old: any) => old.id === e.id);
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
  line_range,
  dry_run,
  use_regex,
}: {
  entityId: string;
  search: string;
  replace: string;
  /**
   * 可选：限定 search 的搜索区间（1-indexed、inclusive），与 get_note_lines /
   * get_note_outline 的行号体系一致。省略时搜索全文（向后兼容）。
   */
  line_range?: LineRange;
  /**
   * 可选：dry_run=true 时不实际写入，仅返回 before/after 预览与受影响行号范围，
   * 供调用方确认后再去掉 dry_run 正式执行。默认 false（直接写入）。
   */
  dry_run?: boolean;
  /**
   * 可选：use_regex=true 时把 search 当作正则源（自动补 'g' 标志），并在 replace
   * 中支持捕获组替换（$1、$2…）。正则模式下多处命中会被全部替换，不再要求唯一。
   * 默认 false（字面匹配，向后兼容）。
   */
  use_regex?: boolean;
}) => {
  const entity = await db.entities.get(entityId);
  if (!entity) {
    throw new ToolError('entity_not_found', `未找到实体 ${entityId}`, { entityId }, '请通过 get_subject_details 确认 entityId 是否正确。');
  }
  if (entity.type !== 'note') {
    throw new ToolError('wrong_entity_type', `实体 ${entityId} 不是笔记（类型: ${entity.type}）`, { entityId, actualType: entity.type }, '请确认 entityId 指向的是 note 类型实体。');
  }

  if (typeof search !== 'string' || search.length === 0) {
    throw new ToolError('invalid_argument', '参数 search 不能为空。', undefined, '请提供要被替换的原始文本（可从 get_entity_content / get_note_lines 复制）。');
  }
  if (typeof replace !== 'string') {
    throw new ToolError('invalid_argument', '参数 replace 必须是字符串。');
  }

  const content = typeof entity.content === 'string' ? entity.content : '';
  const offsets = buildLineOffsets(content);
  const totalLines = offsets.length;
  const range = resolveLineRange(line_range, totalLines) ?? undefined;

  // 1) 定位所有命中（正则语法错误会在内部抛 ToolError 'invalid_regex'）
  const occurrences: Occurrence[] = findOccurrences(content, search, {
    useRegex: !!use_regex,
    lineRange: range,
  });

  // 2) 未命中 → 最近似匹配诊断（最接近片段 / 相似度 / 差异位置 / 行号）
  if (occurrences.length === 0) {
    const nearest = computeNearestMatch(content, search, { lineRange: range });
    throw new ToolError(
      'search_not_found',
      `未在笔记中找到指定文本${range ? `（已限定在第 ${range.start}–${range.end} 行内）` : ''}。最接近的位置：第 ${nearest.line} 行，相似度约 ${(nearest.similarity * 100).toFixed(0)}%。`,
      {
        line_range: range ?? null,
        nearest_match: {
          line: nearest.line,
          column: nearest.column,
          similarity: Number(nearest.similarity.toFixed(3)),
          first_diff: nearest.firstDiff,
          snippet: nearest.snippet,
        },
      },
      use_regex
        ? '请检查正则语法；若不确定目标文本，先用 get_entity_content / get_note_lines 重新读取后再匹配。'
        : '请用 get_entity_content 重新读取最新内容，确保 search 与原文逐字一致（含空格、标点、换行）。nearest_match 已给出最接近的行与首个不一致字符（expected=期望, actual=实际），可据此修正。',
    );
  }

  // 3) 多命中：字面模式拒绝并列出所有位置；正则模式允许全部替换
  if (!use_regex && occurrences.length > 1) {
    throw new ToolError(
      'ambiguous_match',
      `指定文本在笔记中出现了 ${occurrences.length} 次，无法唯一定位。已返回所有命中位置，请补充上下文或用 line_range 限定后重试。`,
      {
        match_count: occurrences.length,
        matches: occurrences.slice(0, 20).map(o => ({ line: o.line, column: o.column, preview: o.preview })),
      },
      '在 search 前后各多加一行上下文使其唯一；或传入 line_range={start,end} 限定行区间（行号可由 get_note_lines / get_note_outline 获取）。',
    );
  }

  // 4) 计算替换结果
  const matchCount = occurrences.length;
  const firstOcc = occurrences[0];
  const lastOcc = occurrences[occurrences.length - 1];
  const affectedLineRange = {
    start: firstOcc.line,
    end: offsetToLineCol(offsets, lastOcc.end - 1).line,
  };

  let newContent: string;
  let beforePreview: string;
  let afterPreview: string;

  if (use_regex) {
    const re = compileSearchRegex(search, '');
    if (range) {
      const { regionStart, regionEnd } = regionForRange(content, offsets, range);
      const replaced = content.slice(regionStart, regionEnd).replace(re, replace);
      newContent = content.slice(0, regionStart) + replaced + content.slice(regionEnd);
    } else {
      newContent = content.replace(re, replace);
    }
    beforePreview = occurrences.slice(0, 3).map(o => content.slice(o.start, o.end)).join('\n');
    afterPreview = replace;
  } else {
    // 字面单命中：用切片拼接，避免 replace 文本里的 $ 被当作反向引用展开
    const o = firstOcc;
    newContent = content.slice(0, o.start) + replace + content.slice(o.end);
    beforePreview = content.slice(o.start, o.end);
    afterPreview = replace;
  }

  const charCountChange = newContent.length - content.length;
  const totalLinesAfter = buildLineOffsets(newContent).length;
  const diff = {
    before: beforePreview,
    after: afterPreview,
    line_range: affectedLineRange,
    char_count_change: charCountChange,
    total_lines_after: totalLinesAfter,
    ...(use_regex ? { match_count: matchCount } : {}),
  };

  if (dry_run) {
    return {
      id: entity.id,
      title: entity.title,
      dry_run: true,
      would_change: newContent !== content,
      affected_line_range: affectedLineRange,
      match_count: matchCount,
      _diff: diff,
    };
  }

  entity.content = newContent;
  entity.updatedAt = Date.now();
  await db.entities.put(entity);

  return {
    id: entity.id,
    title: entity.title,
    affected_line_range: affectedLineRange,
    match_count: matchCount,
    _diff: diff,
  };
};

/**
 * 直接在笔记末尾（或开头）追加内容，无需提供 search 文本。
 * 适合「整体新增一段」的场景；如需改写已有片段请用 patch_note_content。
 *
 * @param args.entityId - 笔记实体 ID
 * @param args.content  - 待追加的 Markdown 文本
 * @param args.position - "end"（默认，追加到末尾）| "start"（插入到开头）
 */
export const append_note_content = async ({
  entityId,
  content: addition,
  position = 'end',
}: {
  entityId: string;
  content: string;
  position?: 'end' | 'start';
}) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new ToolError('entity_not_found', `未找到实体 ${entityId}`, { entityId }, '请通过 get_subject_details 确认 entityId 是否正确。');
  if (entity.type !== 'note') throw new ToolError('wrong_entity_type', `实体 ${entityId} 不是笔记（类型: ${entity.type}）`, { entityId, actualType: entity.type });

  if (typeof addition !== 'string' || addition.length === 0) {
    throw new ToolError('invalid_argument', '参数 content 不能为空。', undefined, '请提供要追加的 Markdown 文本。');
  }

  const old = typeof entity.content === 'string' ? entity.content : '';
  const oldLines = buildLineOffsets(old).length;
  let newContent: string;
  let startLine: number;

  if (position === 'start') {
    startLine = 1;
    newContent = old.length > 0 ? `${addition}\n${old}` : addition;
  } else {
    startLine = old.length > 0 ? oldLines + 1 : 1;
    const tail = old.length > 0 ? old.replace(/\n+$/, '') : '';
    newContent = old.length > 0 ? `${tail}\n${addition}\n` : `${addition}\n`;
  }

  const totalLinesAfter = buildLineOffsets(newContent).length;
  const affectedLineRange = { start: startLine, end: totalLinesAfter };

  entity.content = newContent;
  entity.updatedAt = Date.now();
  await db.entities.put(entity);

  return {
    id: entity.id,
    title: entity.title,
    position,
    appended_chars: addition.length,
    affected_line_range: affectedLineRange,
    total_lines_after: totalLinesAfter,
    _diff: {
      before: '',
      after: addition,
      line_range: affectedLineRange,
      char_count_change: newContent.length - old.length,
      total_lines_after: totalLinesAfter,
    },
  };
};

/**
 * 按行号范围或标题文本删除笔记中的整段内容，无需精确匹配整段文本。
 *
 * - range：按 1-indexed、inclusive 行号区间删除（end_line 省略则删到末尾）。
 * - heading：匹配笔记中的标题文本，删除「该标题行」起、到「下一个同级或更高级标题」
 *   之前（或文末）的整段（含标题行本身）。要求标题文本唯一，否则拒绝并列出所有位置。
 *
 * @param args.entityId - 笔记实体 ID
 * @param args.range    - { start_line, end_line? }，与 heading 二选一
 * @param args.heading  - 标题文本（不含前导的 #），与 range 二选一
 */
export const delete_note_section = async ({
  entityId,
  range,
  heading,
}: {
  entityId: string;
  range?: { start_line: number; end_line?: number };
  heading?: string;
}) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new ToolError('entity_not_found', `未找到实体 ${entityId}`, { entityId }, '请通过 get_subject_details 确认 entityId 是否正确。');
  if (entity.type !== 'note') throw new ToolError('wrong_entity_type', `实体 ${entityId} 不是笔记（类型: ${entity.type}）`, { entityId, actualType: entity.type });

  if (!range && heading === undefined) {
    throw new ToolError('invalid_argument', '必须提供 range 或 heading 之一。', undefined, '用 range={start_line,end_line} 按行删除，或用 heading="标题文本" 删除整个标题段落。');
  }

  const content = typeof entity.content === 'string' ? entity.content : '';
  const offsets = buildLineOffsets(content);
  const totalLines = offsets.length;

  let startLine: number;
  let endLine: number; // inclusive

  if (range) {
    startLine = Math.max(1, Math.min(Math.floor(range.start_line) || 1, totalLines));
    const rawEnd = range.end_line !== undefined ? range.end_line : totalLines;
    endLine = Math.max(startLine, Math.min(Math.floor(rawEnd) || totalLines, totalLines));
  } else {
    const h = String(heading).trim();
    const matches: { line: number; level: number; text: string }[] = [];
    for (let i = 0; i < totalLines; i++) {
      const m = lineText(content, offsets, i + 1).match(/^(#{1,6})\s+(.*)$/);
      if (m && m[2].trim() === h) matches.push({ line: i + 1, level: m[1].length, text: m[2].trim() });
    }
    if (matches.length === 0) {
      // 最近似标题诊断
      let best = { sim: -1, line: 0, text: '' };
      for (let i = 0; i < totalLines; i++) {
        const m = lineText(content, offsets, i + 1).match(/^#{1,6}\s+(.*)$/);
        if (m) {
          const sim = similarityRatio(h, m[1].trim());
          if (sim > best.sim) best = { sim, line: i + 1, text: m[1].trim() };
        }
      }
      throw new ToolError(
        'heading_not_found',
        best.line > 0
          ? `未找到标题 "${h}"。最接近的标题：第 ${best.line} 行 "${best.text}"（相似度约 ${(best.sim * 100).toFixed(0)}%）。`
          : `未找到标题 "${h}"，且笔记中没有任何 Markdown 标题。`,
        { heading: h, nearest: best.line > 0 ? { line: best.line, text: best.text, similarity: Number(best.sim.toFixed(3)) } : null },
        '请用 get_note_outline 查看所有标题与行号，确认标题文本（不含前导 #）后重试，或改用 range 按行删除。',
      );
    }
    if (matches.length > 1) {
      throw new ToolError(
        'ambiguous_heading',
        `标题 "${h}" 在笔记中出现了 ${matches.length} 次，无法唯一定位。`,
        { match_count: matches.length, matches: matches.slice(0, 20).map(m => ({ line: m.line, level: m.level, text: m.text })) },
        '请用 get_note_outline 定位具体行号后改用 range 删除，或提供更完整的标题文本。',
      );
    }
    const lvl = matches[0].level;
    startLine = matches[0].line;
    // 段落终止于下一个「同级或更高级」标题之前（不含），否则到文末
    endLine = totalLines;
    for (let i = startLine; i < totalLines; i++) {
      const m = lineText(content, offsets, i + 1).match(/^(#{1,6})\s+/);
      if (m && i + 1 > startLine && m[1].length <= lvl) {
        endLine = i; // 下一个标题所在行之前
        break;
      }
    }
  }

  // 区间对应的字符范围：含第 endLine 行末尾的换行，使删除后不留空行
  const regionStart = offsets[startLine - 1];
  const regionEnd = endLine < offsets.length ? offsets[endLine] : content.length;
  const deleted = content.slice(regionStart, regionEnd);
  const newContent = content.slice(0, regionStart) + content.slice(regionEnd);
  const totalLinesAfter = buildLineOffsets(newContent).length;
  const affectedLineRange = { start: startLine, end: endLine };

  entity.content = newContent;
  entity.updatedAt = Date.now();
  await db.entities.put(entity);

  return {
    id: entity.id,
    title: entity.title,
    deleted_lines: endLine - startLine + 1,
    affected_line_range: affectedLineRange,
    total_lines_after: totalLinesAfter,
    _diff: {
      before: deleted.replace(/\n+$/, ''),
      after: '',
      line_range: affectedLineRange,
      char_count_change: -deleted.length,
      total_lines_after: totalLinesAfter,
    },
  };
};

/**
 * 将一张图片（网络图片 URL 或已上传的本地附件）以 Markdown 语法插入指定笔记。
 *
 * 图片来源支持两种形式：
 *  - 网络图片 URL（http/https），通常来自 image_search 或 read_url 返回的 images 字段。
 *  - `attachment:<id>` 形式，指向用户在聊天中上传并已存入 db.attachments 的本地图片。
 *
 * @param args.entityId - 笔记实体 ID
 * @param args.image_source - 图片来源：http(s) URL 或 `attachment:<id>`
 * @param args.alt_text - 图片替代文本（可选，默认 "Image"）
 * @param args.anchor_text - 锚点文本（可选）。提供时，图片插入到该文本之后；要求在笔记中唯一出现（同 patch_note_content 的匹配规则）。
 *   不提供时，图片追加到笔记末尾。
 *
 * @throws 当实体不存在、不是笔记、附件不存在，或 anchor_text 未找到/出现多次时抛出错误
 */
export const insert_image_into_note = async ({
  entityId,
  image_source,
  alt_text,
  anchor_text,
}: {
  entityId: string;
  image_source: string;
  alt_text?: string;
  anchor_text?: string;
}) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new ToolError('entity_not_found', `未找到实体 ${entityId}`, { entityId }, '请通过 get_subject_details 确认 entityId 是否正确。');
  if (entity.type !== 'note') throw new ToolError('wrong_entity_type', `实体 ${entityId} 不是笔记（类型: ${entity.type}）`, { entityId, actualType: entity.type }, '请确认 entityId 指向的是 note 类型实体。');

  const src = (image_source || '').trim();
  if (!src) throw new ToolError('invalid_argument', '缺少图片来源 image_source。', undefined, '请提供 http(s) 图片链接或 attachment:<id> 形式的本地附件引用。');

  if (src.startsWith('attachment:')) {
    const attachmentId = src.slice('attachment:'.length);
    const attachment = await db.attachments.get(attachmentId);
    if (!attachment) throw new ToolError('attachment_not_found', `未找到附件 ${attachmentId}，请确认图片已上传成功。`, { attachmentId }, '请在聊天中重新上传图片，或改用网络图片 URL。');
  } else if (!/^https?:\/\//i.test(src)) {
    throw new ToolError('invalid_argument', 'image_source 必须是 http(s) 网络图片链接，或 attachment:<id> 形式的本地附件引用。', { image_source: src });
  }

  const imageMarkdown = `![${alt_text || 'Image'}](${src})`;
  const content = typeof entity.content === 'string' ? entity.content : '';

  let newContent: string;
  let before: string;
  let after: string;

  if (anchor_text) {
    const occurrences = findOccurrences(content, anchor_text, {});
    if (occurrences.length === 0) {
      const nearest = computeNearestMatch(content, anchor_text, {});
      throw new ToolError(
        'anchor_not_found',
        `未在笔记中找到指定的锚点文本 anchor_text。最接近的位置：第 ${nearest.line} 行，相似度约 ${(nearest.similarity * 100).toFixed(0)}%。`,
        {
          nearest_match: {
            line: nearest.line,
            column: nearest.column,
            similarity: Number(nearest.similarity.toFixed(3)),
            first_diff: nearest.firstDiff,
            snippet: nearest.snippet,
          },
        },
        '请用 get_entity_content 重新读取最新内容，确保 anchor_text 与原文逐字一致（含空格、标点、换行）。',
      );
    }
    if (occurrences.length > 1) {
      throw new ToolError(
        'ambiguous_anchor',
        `锚点文本 anchor_text 在笔记中出现了 ${occurrences.length} 次，无法唯一定位。已返回所有命中位置。`,
        {
          match_count: occurrences.length,
          matches: occurrences.slice(0, 20).map(o => ({ line: o.line, column: o.column, preview: o.preview })),
        },
        '请在 anchor_text 中包含更多前后文使其唯一，或省略 anchor_text 直接追加到笔记末尾。',
      );
    }
    const o = occurrences[0];
    before = anchor_text;
    after = `${anchor_text}\n${imageMarkdown}`;
    // 用切片拼接，避免 anchor_text / replace 文本中的特殊字符被当作反向引用
    newContent = content.slice(0, o.start) + after + content.slice(o.end);
  } else {
    before = '';
    after = imageMarkdown;
    newContent = content.length > 0 ? `${content}\n${imageMarkdown}\n` : `${imageMarkdown}\n`;
  }

  entity.content = newContent;
  entity.updatedAt = Date.now();
  await db.entities.put(entity);

  return {
    id: entity.id,
    title: entity.title,
    _diff: { before, after },
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

/**
 * Delete an entity (note, quiz, mindmap, or taskboard) by its ID.
 * Use with caution — this is irreversible. The entity and all its content are permanently removed.
 *
 * For safety, prefer to ask the user before deleting any entity the user created.
 * Cache notes created by sub-agents during research are safe to delete without asking.
 *
 * @param args.entityId - ID of the entity to delete
 * @returns Confirmation with the entity title that was deleted
 */
export const delete_entity = async ({ entityId }: { entityId: string }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`Entity ${entityId} not found`);
  const title = entity.title;
  await deleteEntityAndRelations(entityId);
  return { deleted: true, id: entityId, title };
};
