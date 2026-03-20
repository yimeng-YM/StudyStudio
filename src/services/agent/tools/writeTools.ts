import { db } from '@/db';

/**
 * Robustly parse content from AI tool calls.
 * Handles cases where the AI redundanty wraps content in { content: ... } or { data: ... }
 */
function robustParseContent(content: any): any {
  if (!content) return content;
  
  // If content is an object, check for common redundant wrappers
  if (typeof content === 'object') {
    if (content.content !== undefined) {
      return robustParseContent(content.content);
    }
    if (content.data !== undefined) {
      return robustParseContent(content.data);
    }
  }
  
  // If content is a string that looks like JSON, try to parse it (in case it's a double-stringified JSON)
  if (typeof content === 'string' && (content.trim().startsWith('{') || content.trim().startsWith('['))) {
    try {
      const parsed = JSON.parse(content);
      // If parsing succeeded and resulted in an object, recursively unwrap it
      if (typeof parsed === 'object') {
        return robustParseContent(parsed);
      }
    } catch (e) {
      // Not valid JSON or parsing failed, treat as raw string
    }
  }
  
  return content;
}

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

export const update_subject = async ({ subjectId, name, description }: { subjectId: string; name?: string; description?: string }) => {
  const subject = await db.subjects.get(subjectId);
  if (!subject) throw new Error(`Subject ${subjectId} not found`);
  
  if (name) subject.name = name;
  if (description) subject.description = description;
  
  await db.subjects.put(subject);
  return { id: subject.id, name: subject.name };
};

export const create_mindmap = async ({ subjectId, title, content }: { subjectId: string; title: string; content: any }) => {
  // Check if a mindmap already exists for this subject
  const existing = await db.entities.where({ subjectId, type: 'mindmap' }).first();
  
  if (existing) {
    // Merge content into existing mindmap
    const currentContent = existing.content || { nodes: [], edges: [] };
    const newNodes = [...(currentContent.nodes || [])];
    const newEdges = [...(currentContent.edges || [])];

    // Offset the new nodes to avoid overlap
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

export const update_mindmap = async ({ entityId, title, content }: { entityId: string; title?: string; content?: any }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`Entity ${entityId} not found`);
  if (entity.type !== 'mindmap') throw new Error(`Entity ${entityId} is not a mindmap`);
  
  if (title) entity.title = title;
  if (content !== undefined) entity.content = robustParseContent(content);
  entity.updatedAt = Date.now();
  
  await db.entities.put(entity);
  return { id: entity.id, title: entity.title };
};

export const add_mindmap_elements = async ({ entityId, nodes, edges }: { entityId: string; nodes: any[]; edges: any[] }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`Entity ${entityId} not found`);
  if (entity.type !== 'mindmap') throw new Error(`Entity ${entityId} is not a mindmap`);

  const currentContent = entity.content || { nodes: [], edges: [] };
  const newNodes = [...(currentContent.nodes || [])];
  const newEdges = [...(currentContent.edges || [])];

  // Simple merge by ID
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

export const create_note = async ({ subjectId, title, content }: { subjectId: string; title: string; content: any }) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  
  const robustContent = robustParseContent(content);
  // Robust content handling: AI sometimes wraps string in {content: "..."}
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

export const update_note = async ({ entityId, title, content }: { entityId: string; title?: string; content?: any }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`Entity ${entityId} not found`);
  if (entity.type !== 'note') throw new Error(`Entity ${entityId} is not a note`);
  
  if (title) entity.title = title;
  if (content !== undefined) {
    const robustContent = robustParseContent(content);
    // Robust content handling
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

export const update_quiz = async ({ entityId, title, content }: { entityId: string; title?: string; content?: any }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`Entity ${entityId} not found`);
  if (entity.type !== 'quiz_bank') throw new Error(`Entity ${entityId} is not a quiz`);
  
  if (title) entity.title = title;
  if (content !== undefined) entity.content = robustParseContent(content);
  entity.updatedAt = Date.now();
  
  await db.entities.put(entity);
  return { id: entity.id, title: entity.title };
};

export const create_taskboard = async ({ subjectId, title, content }: { subjectId: string; title: string; content: any }) => {
  // Check if a task_board already exists for this subject
  const existing = await db.entities.where({ subjectId, type: 'task_board' }).first();
  
  if (existing) {
    // Merge content into existing task_board
    const currentContent = existing.content || { nodes: [], edges: [] };
    const newNodes = [...(currentContent.nodes || [])];
    const newEdges = [...(currentContent.edges || [])];

    // Offset the new nodes to avoid overlap
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

export const update_taskboard = async ({ entityId, title, content }: { entityId: string; title?: string; content?: any }) => {
  const entity = await db.entities.get(entityId);
  if (!entity) throw new Error(`Entity ${entityId} not found`);
  if (entity.type !== 'task_board') throw new Error(`Entity ${entityId} is not a task board`);
  
  if (title) entity.title = title;
  if (content !== undefined) entity.content = robustParseContent(content);
  entity.updatedAt = Date.now();
  
  await db.entities.put(entity);
  return { id: entity.id, title: entity.title };
};
