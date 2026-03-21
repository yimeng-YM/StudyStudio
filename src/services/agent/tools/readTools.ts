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
