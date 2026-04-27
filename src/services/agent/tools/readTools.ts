import { db } from '@/db';

/**
 * 检索系统内所有的学科（Subject）基础信息。
 * 供大模型了解用户的宏观知识结构，作为后续深入查询的入口。
 * 
 * @returns 包含所有学科记录的数组
 */
export const get_subjects = async () => {
  const subjects = await db.subjects.toArray();
  return subjects;
};

/**
 * 获取指定学科下的所有学习实体（如笔记、导图、题库）的摘要信息。
 * 为了防止内容过长导致 Token 溢出，此处故意过滤掉了 content 字段，仅返回轻量级的元数据。
 * 大模型可以根据返回的列表决定下一步需深入读取哪个实体的详细内容。
 * 
 * @param args - 包含目标学科的 ID
 * @param args.subjectId - 目标学科唯一标识符
 * @returns 剥离了核心内容的实体摘要列表
 */
export const get_subject_details = async ({ subjectId }: { subjectId: string }) => {
  const entities = await db.entities.where('subjectId').equals(subjectId).toArray();
  // 仅返回实体元数据摘要，节省 AI 上下文 token 消耗
  return entities.map(e => ({
    id: e.id,
    type: e.type,
    title: e.title,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    tags: e.tags
  }));
};

/**
 * 穿透查询单个实体的完整内容。
 * 结合 get_subject_details 使用，大模型定位到感兴趣的实体后，调用此方法获取包括 content 在内的所有明细数据。
 *
 * @param args - 包含目标实体的 ID
 * @param args.entityId - 目标实体唯一标识符
 * @returns 包含序列化业务数据在内的完整实体对象
 * @throws 当指定的实体 ID 不存在时抛出异常
 */
export const get_entity_content = async ({ entityId }: { entityId: string }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) {
    throw new Error(`未找到 ID 为 ${entityId} 的实体`);
  }
  return entity;
};

/**
 * 精确读取笔记的指定行范围，避免每次都拉取全文。
 * 返回内容附带行号，方便大模型定位后续的精确编辑操作。
 *
 * @param args.entityId - 笔记实体 ID
 * @param args.start_line - 起始行号（1-indexed，含）
 * @param args.end_line - 结束行号（1-indexed，含；省略则读到末尾）
 */
export const get_note_lines = async ({
  entityId,
  start_line,
  end_line,
}: {
  entityId: string;
  start_line: number;
  end_line?: number;
}) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`未找到 ID 为 ${entityId} 的实体`);
  if (entity.type !== 'note') throw new Error(`实体 ${entityId} 不是笔记`);

  const raw = typeof entity.content === 'string' ? entity.content : '';
  const lines = raw.split('\n');
  const totalLines = lines.length;

  const start = Math.max(1, start_line);
  const end = end_line !== undefined ? Math.min(end_line, totalLines) : totalLines;

  const selected = lines.slice(start - 1, end);
  return {
    entityId,
    title: entity.title,
    start_line: start,
    end_line: end,
    total_lines: totalLines,
    // 每行前缀行号，方便 AI 精准定位
    content: selected.map((line, i) => `${start + i}: ${line}`).join('\n'),
  };
};

/**
 * 精确读取题库中的指定题目，支持按题目 ID 列表或索引区间两种定位方式。
 * 避免每次都返回全部题目浪费 Token。
 *
 * @param args.entityId - 题库实体 ID
 * @param args.question_ids - 按题目 ID 精确筛选（与索引区间二选一）
 * @param args.start_index - 起始题目序号（1-indexed，含）
 * @param args.end_index - 结束题目序号（1-indexed，含）
 */
export const get_quiz_questions = async ({
  entityId,
  question_ids,
  start_index,
  end_index,
}: {
  entityId: string;
  question_ids?: string[];
  start_index?: number;
  end_index?: number;
}) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`未找到 ID 为 ${entityId} 的实体`);
  if (entity.type !== 'quiz_bank') throw new Error(`实体 ${entityId} 不是题库`);

  const questions: any[] = (entity.content?.questions) ?? [];

  let selected: any[];
  if (question_ids && question_ids.length > 0) {
    selected = questions.filter((q: any) => question_ids.includes(q.id));
  } else if (start_index !== undefined || end_index !== undefined) {
    const s = start_index !== undefined ? start_index - 1 : 0;
    const e = end_index !== undefined ? end_index : questions.length;
    selected = questions.slice(s, e);
  } else {
    selected = questions;
  }

  return {
    entityId,
    title: entity.title,
    total_questions: questions.length,
    selected_count: selected.length,
    // 附带全局序号，方便 AI 引用
    questions: selected.map((q: any) => ({
      index: questions.indexOf(q) + 1,
      ...q,
    })),
  };
};
