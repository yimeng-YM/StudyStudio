import { AISettings, db } from '@/db';
import { Message, ToolCall, streamAICompletion } from '@/services/ai';
import { ToolDefinitions, executeTool } from './ToolRegistry';
import { isJsonComplete } from '@/lib/utils';
import { SUB_AGENT_PROMPT, DEFAULT_MAX_TOKENS } from '@/services/promptConfig';
import { isWebSearchUsable, isWikipediaOn, buildWebToolsStatus } from '@/lib/toolConfig';

/**
 * 子 Agent 执行过程中向 UI 上报的回调集合。
 * 与 React state 解耦，由调用方（useChatSession）在回调里更新 subAgentStates。
 */
export interface SubAgentCallbacks {
  /** 子 Agent 状态变化，如「正在思考…」「正在执行工具: xxx」 */
  onStatus?: (status: string) => void;
  /** 子 Agent 的流式文本分片（折叠可查看的实时输出） */
  onChunk?: (chunk: string) => void;
  /** 子 Agent 内部发起一次工具调用时上报（名称 + 原始参数串，供 UI 用 getToolDescription 渲染） */
  onToolCall?: (name: string, argsRaw: string) => void;
}

/**
 * runSubAgent 的输入参数。
 */
export interface RunSubAgentParams {
  /** 委派给子 Agent 的任务描述（须自包含：目标 + 约束） */
  task: string;
  /** 可选上下文，通常是实体 ID（subjectId/entityId 等），拼接到任务后注入 */
  context?: string;
  /** AI 基础配置（沿用主会话 settings） */
  settings: AISettings;
  /** 中断信号，通常派生自主 Agent 的 AbortController */
  signal?: AbortSignal;
  /** 最大工具循环轮数，防止子 Agent 失控不收敛。默认 10 */
  maxRounds?: number;
  /** UI 回调 */
  callbacks?: SubAgentCallbacks;
}

/**
 * 精简的子 Agent 执行器。
 *
 * 与主 Agent 的 processAgentLoop 相比，刻意去掉了：
 *   - 规划流程（present_plan / start_execution）：子 Agent 直接执行。
 *   - 数据库持久化：子 Agent 的中间消息不落库，只有最终摘要回传给主 Agent。
 *   - React state 耦合：通过回调上报，由调用方决定如何展示。
 *   - 再次委派：工具集不含 delegate_task，天然禁止递归。
 *
 * 复用了主链路的 streamAICompletion / executeTool / isJsonComplete，保证长 JSON 解析与
 * 截断检测行为与主 Agent 一致。
 *
 * @returns 子 Agent 的最终自然语言摘要文本，作为 delegate_task 的工具结果
 */
export async function runSubAgent(params: RunSubAgentParams): Promise<string> {
  const { task, context, settings, signal, callbacks: cb } = params;
  const maxRounds = params.maxRounds ?? 10;

  // 读取用户的联网工具开关（与主 Agent 共用同一份 AIConfig），按可用性过滤 web 工具。
  // 子 Agent 始终排除委派/规划工具（避免再委派/触发规划）；read_url 不受开关控制，始终可用。
  const cfg = (await db.settings.get(1)) as any;
  const webSearchOn = isWebSearchUsable(cfg);
  const wikiOn = isWikipediaOn(cfg);
  const subTools = ToolDefinitions.filter((t) => {
    const n = t.function.name;
    if (['delegate_task', 'present_plan', 'start_execution'].includes(n)) return false;
    if (n === 'web_search') return webSearchOn;
    if (n === 'search_wikipedia') return wikiOn;
    return true;
  });

  const userContent = context
    ? `${task}\n\n## Context\n${context}`
    : task;

  let messages: Message[] = [
    { role: 'system', content: SUB_AGENT_PROMPT + '\n\n' + buildWebToolsStatus(cfg) },
    { role: 'user', content: userContent },
  ];

  for (let round = 0; round < maxRounds; round++) {
    cb?.onStatus?.('子任务思考中…');
    const aiMessage: Message = { role: 'assistant', content: '', tool_calls: [] };
    let finishReason: string | null = null;

    // 累积流式 tool_calls 分片（与主循环 handleToolCallChunk 同逻辑）
    const handleToolCallChunk = (toolCallChunks: any[]) => {
      if (!aiMessage.tool_calls) aiMessage.tool_calls = [];
      toolCallChunks.forEach((chunk) => {
        const index = chunk.index ?? 0;
        if (!aiMessage.tool_calls![index]) {
          aiMessage.tool_calls![index] = {
            id: chunk.id,
            type: 'function',
            function: { name: chunk.function?.name || '', arguments: '' },
          };
        }
        if (chunk.function?.arguments) {
          aiMessage.tool_calls![index].function.arguments += chunk.function.arguments;
        }
      });
    };

    try {
      await streamAICompletion(
        messages,
        settings,
        (chunk) => { aiMessage.content += chunk; cb?.onChunk?.(chunk); },
        subTools,
        handleToolCallChunk,
        { maxTokens: DEFAULT_MAX_TOKENS },
        signal,
        (rChunk) => { aiMessage.reasoning_content = (aiMessage.reasoning_content ?? '') + rChunk; },
        (reason) => { if (reason) finishReason = reason; }
      );
    } catch (error: any) {
      if (error.name === 'AbortError') {
        cb?.onStatus?.('子任务已停止');
        return '子任务已停止。';
      }
      cb?.onStatus?.('子任务执行失败');
      return `子任务执行失败: ${error.message || error}`;
    }

    // 清理 tool_calls 中的稀疏空洞（部分供应商 index 跳跃）
    if (aiMessage.tool_calls) {
      aiMessage.tool_calls = aiMessage.tool_calls.filter(
        (tc): tc is ToolCall => !!tc && !!tc.function
      );
    }

    // 冗余清理：个别模型把工具参数 JSON 误输出到 content，剥离开头的 {...}
    if (typeof aiMessage.content === 'string' && aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const cleaned = aiMessage.content.replace(/^\{[\s\S]*?\}\s*/, '').trim();
      if (cleaned !== aiMessage.content) aiMessage.content = cleaned;
    }

    const toolCalls = aiMessage.tool_calls || [];

    // 无工具调用 → 子任务完成，返回摘要
    if (toolCalls.length === 0) {
      cb?.onStatus?.('子任务已完成');
      const summary = (typeof aiMessage.content === 'string' ? aiMessage.content : '').trim();
      return summary || '（子 Agent 未给出摘要）';
    }

    // 执行子 Agent 的工具调用
    const toolMessages: Message[] = [];
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;

      // 兜底：子 Agent 不应调用委派/规划工具（工具集已过滤，此处防模型违规）
      if (['delegate_task', 'present_plan', 'start_execution'].includes(toolName)) {
        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify({ error: 'forbidden_in_subagent', message: '子 Agent 不能调用此工具' }),
        });
        continue;
      }

      // 截断检测：与主循环一致的判定逻辑
      if (finishReason === 'length' && !isJsonComplete(toolCall.function.arguments)) {
        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify({
            error: 'tool_arguments_truncated',
            message: '参数 JSON 不完整（疑似被输出长度限制截断），未执行。请缩减单次内容或改用增量工具分批完成。',
          }),
        });
        continue;
      }

      cb?.onStatus?.(`子任务执行工具: ${toolName}`);
      cb?.onToolCall?.(toolName, toolCall.function.arguments || '');

      try {
        const result = await executeTool(toolCall);
        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify(result),
        });
      } catch (error: any) {
        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify({ error: error.message }),
        });
      }
    }

    // 子 Agent 的工具调用不回传 _diff（与主循环一致，避免无效 token）
    const toolMessagesForAI = toolMessages.map((m) => {
      if (m.role === 'tool' && typeof m.content === 'string') {
        try {
          const parsed = JSON.parse(m.content);
          if (parsed._diff !== undefined) {
            const { _diff: _removed, ...rest } = parsed;
            return { ...m, content: JSON.stringify(rest) };
          }
        } catch { /* 非 JSON 结果原样回传 */ }
      }
      return m;
    });

    messages = [...messages, aiMessage, ...toolMessagesForAI];
  }

  // 超过最大轮数仍未收敛
  cb?.onStatus?.('子任务超过最大轮数');
  return `子任务在 ${maxRounds} 轮内未完成，可能需要更聚焦的任务描述。`;
}