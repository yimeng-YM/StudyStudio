import { AISettings } from '@/db';
import { getAICompletion, AIRequestOptions } from './ai';
import * as dagre from 'dagre';
import { Node, Edge } from 'reactflow';
import { parseAIJson } from '@/lib/utils';
import { DEFAULT_MAX_TOKENS, CONTENT_GENERATION_PROMPTS } from './promptConfig';

/**
 * 思维导图数据生成选项
 */
export interface MindMapOptions {
  minNodes?: number;
  maxNodes?: number;
  depth?: number;
}

/**
 * 题库生成选项
 */
export interface QuizOptions {
  minQuestions?: number;
  maxQuestions?: number;
  types?: string[];
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
}

/**
 * 任务列表生成选项
 */
export interface TaskOptions {
  minTasks?: number;
  maxTasks?: number;
}

/**
 * 生成思维导图数据
 * @param topic 主题
 * @param settings AI设置
 * @param options 生成选项
 */
export async function generateMindMapData(
  topic: string, 
  settings: AISettings,
  _options?: MindMapOptions
): Promise<{ nodes: Node[], edges: Edge[] }> {
  const prompt = CONTENT_GENERATION_PROMPTS.mindmap(topic);
  
  const apiOptions: AIRequestOptions = {
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: 0.7
  };

  const response = await getAICompletion(
    [{ role: 'user', content: prompt }], 
    settings,
    apiOptions
  );
  
  let rawNodes: any[];
  try {
    rawNodes = parseAIJson(response);
  } catch (e) {
    throw new Error("AI returned invalid JSON: " + response.slice(0, 100));
  }

  // 验证节点数量
  if (rawNodes.length < 5) {
    console.warn(`AI generated very few nodes: ${rawNodes.length}`);
  }

  const edges: Edge[] = [];
  
  const g = new dagre.graphlib.Graph();
  // 使用更紧凑的间距
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  rawNodes.forEach((n: any) => {
      // 进一步优化宽度估算
      const width = Math.max(120, (n.label?.length || 0) * 12 + 30);
      g.setNode(n.id, { label: n.label, width, height: 60 });
      if (n.parentId) {
          g.setEdge(n.parentId, n.id);
          edges.push({ 
            id: `e${n.parentId}-${n.id}`, 
            source: n.parentId, 
            target: n.id,
            sourceHandle: 'right-s',
            targetHandle: 'left-t'
          });
      }
  });

  dagre.layout(g);

  // 简单的挤压检测与重叠处理 (Overlap Resolution)
  const resolvedNodes = g.nodes().map((id) => {
      const node = g.node(id);
      const rawNode = rawNodes.find((n: any) => n.id === id);
      return {
          id,
          type: !rawNode.parentId ? 'custom' : 'custom', // 统一使用 customNode 以便获得更好的 UI
          data: { label: rawNode?.label || node.label },
          position: { x: node.x, y: node.y },
          width: node.width,
          height: node.height
      };
  });

  // 二次检查重叠 (简单横向推移逻辑)
  // 虽然 dagre 理论上不会重叠，但如果节点内容极长或有多中心点，这里可以做兜底
  for (let i = 0; i < resolvedNodes.length; i++) {
    for (let j = i + 1; j < resolvedNodes.length; j++) {
      const n1 = resolvedNodes[i];
      const n2 = resolvedNodes[j];
      
      const dx = Math.abs(n1.position.x - n2.position.x);
      const dy = Math.abs(n1.position.y - n2.position.y);
      const minX = (n1.width + n2.width) / 2 + 50; // 额外增加 50px 安全边距
      const minY = (n1.height + n2.height) / 2 + 30; // 额外增加 30px 安全边距

      if (dx < minX && dy < minY) {
        // 发现重叠，根据相对位置推开
        if (n2.position.x > n1.position.x) {
          n2.position.x += (minX - dx);
        } else {
          n1.position.x += (minX - dx);
        }
      }
    }
  }

  return { 
    nodes: resolvedNodes.map(({ width, height, ...rest }) => ({ ...rest })), 
    edges 
  };
}

/**
 * 生成任务列表数据
 * @param goal 目标
 * @param settings AI设置
 * @param options 生成选项
 */
export async function generateTasksData(
  goal: string, 
  settings: AISettings,
  _options?: TaskOptions
): Promise<string[]> {
  const prompt = CONTENT_GENERATION_PROMPTS.tasks(goal);
  
  const apiOptions: AIRequestOptions = {
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: 0.7
  };

  const response = await getAICompletion(
    [{ role: 'user', content: prompt }], 
    settings,
    apiOptions
  );
  
  try {
    const tasks = parseAIJson(response);
    if (!Array.isArray(tasks)) {
      throw new Error("Response is not an array");
    }
    return tasks;
  } catch (e) {
    throw new Error("AI returned invalid JSON: " + response.slice(0, 100));
  }
}

/**
 * 生成题库数据
 * @param subject 学科名称
 * @param topic 主题
 * @param settings AI设置
 * @param options 生成选项
 */
export async function generateQuizData(
  subject: string,
  topic: string,
  settings: AISettings,
  _options?: QuizOptions
): Promise<any> {
  const prompt = CONTENT_GENERATION_PROMPTS.quiz(subject, topic);
  
  const apiOptions: AIRequestOptions = {
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: 0.7
  };

  const response = await getAICompletion(
    [{ role: 'user', content: prompt }], 
    settings,
    apiOptions
  );
  
  try {
    const quizContent = parseAIJson(response);
    if (!quizContent.questions || !Array.isArray(quizContent.questions)) {
      throw new Error("Response does not contain valid questions array");
    }
    
    // 验证题目数量
    if (quizContent.questions.length < 5) {
      console.warn(`AI generated very few questions: ${quizContent.questions.length}`);
    }
    
    return quizContent;
  } catch (e) {
    throw new Error("AI returned invalid JSON: " + response.slice(0, 100));
  }
}

/**
 * 生成笔记内容
 * @param subject 学科名称
 * @param topic 主题
 * @param settings AI设置
 */
export async function generateNoteContent(
  subject: string,
  topic: string,
  settings: AISettings
): Promise<string> {
  const prompt = CONTENT_GENERATION_PROMPTS.note(subject, topic);
  
  const apiOptions: AIRequestOptions = {
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: 0.7
  };

  const response = await getAICompletion(
    [{ role: 'user', content: prompt }], 
    settings,
    apiOptions
  );
  
  return response;
}
