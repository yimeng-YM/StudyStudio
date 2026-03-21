import { AISettings } from '@/db';
import { getAICompletion, AIRequestOptions } from './ai';
import * as dagre from 'dagre';
import { Node, Edge } from 'reactflow';
import { parseAIJson } from '@/lib/utils';
import { DEFAULT_MAX_TOKENS, CONTENT_GENERATION_PROMPTS } from './promptConfig';

/**
 * 思维导图生成的高级配置选项。
 * 允许调用方精细控制生成树的规模与层级。
 */
export interface MindMapOptions {
  /** 期望的最小节点数，用于校验生成质量 */
  minNodes?: number;
  /** 期望的最大节点数，防止数据过载导致渲染卡顿 */
  maxNodes?: number;
  /** 树的最大展开深度 */
  depth?: number;
}

/**
 * 题库生成的配置选项。
 * 支持指定题型比例和难度梯度。
 */
export interface QuizOptions {
  /** 题目最小生成数量 */
  minQuestions?: number;
  /** 题目最大生成数量 */
  maxQuestions?: number;
  /** 需要包含的题型列表，例如：['multiple_choice', 'true_false'] */
  types?: string[];
  /** 
   * 难度控制参数：
   * - 'easy': 偏向基础概念识别
   * - 'medium': 侧重理解与简单应用
   * - 'hard': 涉及复杂分析和综合判断
   * - 'mixed': 各难度按比例混合
   */
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
}

/**
 * 任务拆解列表生成的配置选项。
 */
export interface TaskOptions {
  /** 期望分解的最小子任务数 */
  minTasks?: number;
  /** 限制的最大子任务数，避免任务过度碎片化 */
  maxTasks?: number;
}

/**
 * 智能化生成思维导图的核心逻辑。
 * 整体流程包含：
 * 1. 组装提示词并向大模型请求 JSON 格式的节点数组。
 * 2. 使用 Dagre 算法对提取到的树状或网状结构进行有向无环图（DAG）的物理排版。
 * 3. 执行防碰撞检测，避免极端情况下的节点重叠。
 *
 * @param topic - 用户输入的核心主题词
 * @param settings - 包含密钥和模型标识的 AI 基础配置
 * @param _options - （预留）针对节点规模和深度的生成选项
 * @returns 包含经过绝对坐标计算的 React Flow 节点数组和连接线数组
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

  // 质量检查：节点数量过少时抛出警告
  if (rawNodes.length < 5) {
    console.warn(`AI generated very few nodes: ${rawNodes.length}`);
  }

  const edges: Edge[] = [];
  
  // 初始化 Dagre 布局引擎实例
  const g = new dagre.graphlib.Graph();
  // rankdir='LR' 表示布局从左到右生长，nodesep 控制同级节点间距，ranksep 控制层级间距
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  // 将原始 JSON 节点和连线关系注入 Dagre 图模型中
  rawNodes.forEach((n: any) => {
      // 根据节点文本长度进行基础宽度的自适应估算，保障文字不会溢出
      const width = Math.max(120, (n.label?.length || 0) * 12 + 30);
      g.setNode(n.id, { label: n.label, width, height: 60 });
      
      if (n.parentId) {
          g.setEdge(n.parentId, n.id);
          // 为 React Flow 组装标准边对象，指定起止锚点方向
          edges.push({ 
            id: `e${n.parentId}-${n.id}`, 
            source: n.parentId, 
            target: n.id,
            sourceHandle: 'right-s',
            targetHandle: 'left-t'
          });
      }
  });

  // 执行基于层级的坐标计算
  dagre.layout(g);

  // 提取计算后的物理坐标信息并转换为 React Flow 标准 Node 结构
  const resolvedNodes = g.nodes().map((id) => {
      const node = g.node(id);
      const rawNode = rawNodes.find((n: any) => n.id === id);
      return {
          id,
          // 统一采用 custom 类型的自定义节点渲染，以实现特定的 UI 效果
          type: 'custom',
          data: { label: rawNode?.label || node.label },
          position: { x: node.x, y: node.y },
          width: node.width,
          height: node.height
      };
  });

  // 后处理：简单的挤压检测与重叠处理逻辑 (Overlap Resolution)
  // 虽然 dagre 算法通常不会产生重叠，但当文本宽度估算不准确时可能出现挤压。这里做二次推移兜底。
  for (let i = 0; i < resolvedNodes.length; i++) {
    for (let j = i + 1; j < resolvedNodes.length; j++) {
      const n1 = resolvedNodes[i];
      const n2 = resolvedNodes[j];
      
      const dx = Math.abs(n1.position.x - n2.position.x);
      const dy = Math.abs(n1.position.y - n2.position.y);
      const minX = (n1.width + n2.width) / 2 + 50; // 额外增加 50px 横向安全边界
      const minY = (n1.height + n2.height) / 2 + 30; // 额外增加 30px 纵向安全边界

      if (dx < minX && dy < minY) {
        // 发生空间重叠，根据相对中心位置将节点横向推开
        if (n2.position.x > n1.position.x) {
          n2.position.x += (minX - dx);
        } else {
          n1.position.x += (minX - dx);
        }
      }
    }
  }

  return { 
    // 移除 React Flow 内部不需要的原始宽高等临时字段
    nodes: resolvedNodes.map(({ width, height, ...rest }) => ({ ...rest })), 
    edges 
  };
}

/**
 * 智能拆解并生成结构化的子任务列表。
 * 根据用户输入的宏观学习目标，由大模型拆分为具备可执行性的具体任务步骤。
 *
 * @param goal - 用户设定的高层次学习或工作目标
 * @param settings - AI 基础配置参数
 * @param _options - （预留）任务数量与颗粒度的控制选项
 * @returns 包含各个子任务描述文本的数组
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
 * 根据学科和主题智能生成配套测试题库。
 * 解析大模型返回的 JSON，生成包含单选、多选、判断等多类型题目的结构化对象。
 *
 * @param subject - 题目所属的学科大类
 * @param topic - 测试考察的具体知识点主题
 * @param settings - AI 基础配置参数
 * @param _options - （预留）题型、难度和题目数量的配置选项
 * @returns 序列化后的题库对象，包含 questions 数组及对应的答案解析
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
    
    // 数据完整性初步校验
    if (quizContent.questions.length < 5) {
      console.warn(`AI generated very few questions: ${quizContent.questions.length}`);
    }
    
    return quizContent;
  } catch (e) {
    throw new Error("AI returned invalid JSON: " + response.slice(0, 100));
  }
}

/**
 * 根据指定的学科与主题，智能撰写结构化的学习笔记。
 * 通常生成采用 Markdown 格式的长文本内容，适用于文档归档和初步学习参考。
 *
 * @param subject - 笔记所属的学科分类
 * @param topic - 笔记聚焦的具体知识主题
 * @param settings - AI 基础配置参数
 * @returns 生成的 Markdown 格式笔记纯文本
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

  // 直接返回生成的长文本字符串，不需要经过 JSON 反序列化
  const response = await getAICompletion(
    [{ role: 'user', content: prompt }], 
    settings,
    apiOptions
  );
  
  return response;
}
