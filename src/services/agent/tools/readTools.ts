import { db } from '@/db';

export const get_subjects = async () => {
  const subjects = await db.subjects.toArray();
  return subjects;
};

export const get_subject_details = async ({ subjectId }: { subjectId: string }) => {
  const entities = await db.entities.where('subjectId').equals(subjectId).toArray();
  // Return summary of entities without full content to save tokens
  return entities.map(e => ({
    id: e.id,
    type: e.type,
    title: e.title,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    tags: e.tags
  }));
};

export const get_entity_content = async ({ entityId }: { entityId: string }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) {
    throw new Error(`Entity with ID ${entityId} not found`);
  }
  return entity;
};
