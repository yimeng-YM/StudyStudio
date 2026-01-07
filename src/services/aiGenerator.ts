import { AISettings } from '@/db';
import { getAICompletion } from './ai';
import * as dagre from 'dagre';
import { Node, Edge } from 'reactflow';

export async function generateMindMapData(topic: string, settings: AISettings): Promise<{ nodes: Node[], edges: Edge[] }> {
  const prompt = `Create a detailed mind map for the topic: "${topic}". 
  Return ONLY a JSON array of objects representing nodes. 
  Each object must have "id" (unique string), "label" (string), and optional "parentId" (string, referring to id of parent). 
  The root node should have no parentId. 
  Ensure at least 10-15 nodes with meaningful hierarchy. 
  No markdown code blocks.`;
  
  const response = await getAICompletion([{ role: 'user', content: prompt }], settings);
  let rawNodes: any[];
  try {
    const clean = response.replace(/```json/g, '').replace(/```/g, '').trim();
    rawNodes = JSON.parse(clean);
  } catch (e) {
    throw new Error("AI returned invalid JSON: " + response.slice(0, 100));
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR' });
  g.setDefaultEdgeLabel(() => ({}));

  rawNodes.forEach((n: any) => {
      g.setNode(n.id, { label: n.label, width: 150, height: 50 });
      if (n.parentId) {
          g.setEdge(n.parentId, n.id);
          edges.push({ id: `e${n.parentId}-${n.id}`, source: n.parentId, target: n.id });
      }
  });

  dagre.layout(g);

  g.nodes().forEach((id) => {
      const node = g.node(id);
      const rawNode = rawNodes.find((n: any) => n.id === id);
      nodes.push({
          id,
          type: !rawNode.parentId ? 'input' : 'default',
          data: { label: rawNode?.label || node.label },
          position: { x: node.x, y: node.y }
      });
  });

  return { nodes, edges };
}

export async function generateTasksData(goal: string, settings: AISettings): Promise<string[]> {
  const prompt = `Generate a list of 5-10 actionable tasks for the goal: "${goal}". Return ONLY a JSON array of strings. Example: ["Task 1", "Task 2"]. No markdown code blocks.`;
  
  const response = await getAICompletion([{ role: 'user', content: prompt }], settings);
  try {
    const clean = response.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    throw new Error("AI returned invalid JSON");
  }
}
