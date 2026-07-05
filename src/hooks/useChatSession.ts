import { useState, useEffect, useRef } from 'react';
import { db } from '@/db';
import { generateUUID, isJsonComplete, parseToolArguments, AI_ONLY_HINT_PREFIX } from '@/lib/utils';
import { Message, ToolCall, streamAICompletion } from '@/services/ai';
import { useAIStore, getFullContextPrompt } from '@/store/useAIStore';
import { ToolDefinitions, executeTool } from '@/services/agent/ToolRegistry';
import { runSubAgent, SubAgentCallbacks } from '@/services/agent/runSubAgent';
import { useDialog } from '@/components/ui/DialogProvider';
import { getSystemPromptWithContext } from '@/services/promptConfig';
import { generateSessionTitle } from '@/services/aiGenerator';
import { isWebSearchUsable, isWebUsable, isWikipediaOn, buildWebToolsStatus } from '@/lib/toolConfig';

/**
 * 任务执行计划状态
 * - none: 暂无计划
 * - pending: 计划已生成，等待用户确认
 * - confirmed: 用户已确认，准备或正在执行
 * - rejected: 用户已拒绝，需要重新生成
 */
export type PlanStatus = 'none' | 'pending' | 'confirmed' | 'rejected';

/**
 * 任务执行计划的详情数据结构
 */
export interface PlanInfo {
  status: PlanStatus;
  content: string;
  steps: string[];
}

/**
 * 子 Agent（delegate_task）的实时执行状态，用于在 UI 渲染子任务卡片。
 * 按 toolCall.id 索引存储，供 ToolCallRenderer 展示进度 / 折叠流式 / 完成摘要。
 */
export interface SubAgentState {
  /** 当前状态文案，如「子任务思考中…」「子任务执行工具: create_quiz」 */
  status: string;
  /** 子 Agent 的流式输出累积文本（折叠可查看） */
  streamText: string;
  /** 子 Agent 内部发起的工具调用列表 */
  toolCalls: { name: string; args: string }[];
  /** 是否已结束（完成 / 失败 / 停止） */
  done: boolean;
  /** 失败时的错误信息 */
  error?: string;
}

/**
 * 管理 AI 聊天会话状态及核心执行流的 Hook
 * 处理消息存储、Agent 循环、工具调用及计划（Plan）模式的特殊工作流
 *
 * @param sessionId - 当前会话 ID，为 null 时表示新建会话
 * @param mode - 会话运行模式：'plan'（带确认的计划模式）或 'act'（直接执行模式）
 * @returns 包含消息列表、加载状态、计划状态及会话控制方法的对象
 */
export function useChatSession(sessionId: string | null, mode: 'plan' | 'act' | 'research') {
  const settings = useAIStore(s => s.settings);
  const currentContext = useAIStore(s => s.currentContext);
  const config = useAIStore(s => s.config);
  const { showAlert } = useDialog();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId);
  
  const [planStatus, setPlanStatus] = useState<PlanStatus>('none');
  const [currentPlan, setCurrentPlan] = useState<string>('');
  const awaitingConfirmation = useRef(false);
  const planExtractedRef = useRef(false);
  
  // 用于取消请求的 AbortController
  const abortControllerRef = useRef<AbortController | null>(null);

  // 用户是否已请求停止整个 Agent 循环（含工具执行和递归调用）
  const stoppedRef = useRef(false);

  // 记录本轮流式的结束原因，'length' 表示输出被 max_tokens 截断
  const finishReasonRef = useRef<string | null>(null);

  // 思考（reasoning）开始时间戳，用于计算「已思考 Xs」耗时；null 表示本轮未产生思考内容
  const reasoningStartRef = useRef<number | null>(null);

  // 子 Agent（delegate_task）的实时状态，按 toolCall.id 索引，供 UI 渲染子任务卡片
  const [subAgentStates, setSubAgentStates] = useState<Record<string, SubAgentState>>({});

  // 研究任务进度列表，由 update_task_list 工具调用驱动
  const [todoList, setTodoList] = useState<{ id: string; text: string; status: 'pending' | 'in_progress' | 'completed' }[]>([]);

  // ask_user 交互状态：非 null 表示正在等待用户回答
  const [askState, setAskState] = useState<{
    active: boolean;
    question: string;
    type: 'single' | 'multi' | 'text';
    options?: string[];
    toolCallId: string;
  } | null>(null);

  // 安全合并更新某个子 Agent 的状态（处理尚未初始化的 id）。
  // 同时维护 ref 快照，供 delegate 完成时将子工具调用列表嵌入 tool 消息持久化。
  const subAgentStatesRef = useRef<Record<string, SubAgentState>>({});
  const updateSubAgent = (
    id: string,
    patch: Partial<SubAgentState> | ((s: SubAgentState) => Partial<SubAgentState>)
  ) => {
    setSubAgentStates((prev) => {
      const cur = prev[id] ?? { status: '', streamText: '', toolCalls: [], done: false };
      const p = typeof patch === 'function' ? patch(cur) : patch;
      const next = { ...prev, [id]: { ...cur, ...p } };
      subAgentStatesRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    if (sessionId) {
      setCurrentSessionId(sessionId);
      db.chatMessages.where('sessionId').equals(sessionId).sortBy('createdAt').then(msgs => {
        setMessages(msgs.map(m => ({
          role: m.role as any,
          content: m.content,
          name: m.name,
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id,
          reasoning_content: m.reasoning_content,
          reasoningTimeMs: m.reasoningTimeMs
        })));
        // Rebuild subAgentStates from persisted delegate_task tool messages
        const rebuilt: Record<string, SubAgentState> = {};
        for (const m of msgs) {
          if (m.role === 'tool' && m.name === 'delegate_task' && typeof m.content === 'string') {
            try {
              const parsed = JSON.parse(m.content);
              if (parsed.subToolCalls && Array.isArray(parsed.subToolCalls)) {
                rebuilt[m.tool_call_id!] = {
                  status: parsed.error ? '失败' : '已完成',
                  streamText: '',
                  toolCalls: parsed.subToolCalls,
                  done: true,
                  error: parsed.error,
                };
              }
            } catch {
              // Old format: plain text summary, no subToolCalls available
              rebuilt[m.tool_call_id!] = {
                status: '已完成',
                streamText: '',
                toolCalls: [],
                done: true,
              };
            }
          }
        }
        setSubAgentStates(rebuilt);
      });
    } else {
      setCurrentSessionId(null);
      setMessages([]);
      setPlanStatus('none');
      setCurrentPlan('');
      awaitingConfirmation.current = false;
      planExtractedRef.current = false;
      setTodoList([]);
      setAskState(null);
      setSubAgentStates({});
    }
  }, [sessionId]);

  /**
   * 创建新的对话会话
   *
   * @param title - 会话的初始标题
   * @returns 新创建的会话 ID
   */
  const createSession = async (title: string) => {
    const newSessionId = generateUUID();
    const now = Date.now();
    await db.chatSessions.add({
      id: newSessionId,
      title,
      mode,
      createdAt: now,
      updatedAt: now
    });
    setCurrentSessionId(newSessionId);
    return newSessionId;
  };

  /**
   * 将单条消息持久化到数据库
   *
   * @param msg - 待保存的消息对象
   * @param sId - 所属的会话 ID
   */
  const saveMessage = async (msg: Message, sId: string) => {
    await db.chatMessages.add({
      id: generateUUID(),
      sessionId: sId,
      role: msg.role as any,
      content: msg.content,
      name: msg.name,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      reasoning_content: msg.reasoning_content,
      reasoningTimeMs: msg.reasoningTimeMs,
      createdAt: Date.now()
    });
    
    await db.chatSessions.update(sId, { updatedAt: Date.now() });
  };

  /**
   * 后台异步为新会话生成智能标题。
   * 仅在首轮对话完成后触发，使用 namingModel（留空则回退主模型）。
   * 通过 dexie 的 LiveQuery 自动刷新会话列表 UI；失败静默，不影响主对话。
   *
   * @param sessionId - 待命名的会话 ID
   * @param firstUserContent - 用户的首条提问文本（作为命名主要依据）
   */
  const autoRenameSession = async (sessionId: string, firstUserContent: string) => {
    if (!settings) return;
    try {
      // 从数据库取第一条含实际文本的助手回复作为命名参考
      const assistantMsgs = await db.chatMessages
        .where('sessionId')
        .equals(sessionId)
        .filter(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0)
        .sortBy('createdAt');
      const firstReply = assistantMsgs[0];
      const replyText = typeof firstReply?.content === 'string' ? firstReply.content : '';

      const title = await generateSessionTitle(firstUserContent, replyText, settings);
      await db.chatSessions.update(sessionId, { title, updatedAt: Date.now() });
    } catch (e) {
      // 命名失败不影响主对话，静默忽略
      console.warn('自动命名会话失败:', e);
    }
  };



  /**
   * 发送用户消息并触发 AI 响应流
   *
   * @param content - 用户输入的文本内容
   * @param files - 用户附带的文件或图片资源
   * @returns 活跃的会话 ID
   */
  const sendMessage = async (content: string, files: any[] = []) => {
    if (!settings?.apiKey || !settings?.baseUrl) {
      showAlert("请在设置中配置 AI 服务的 API Key 和请求地址。", { title: '缺少配置' });
      return;
    }

    // 重置停止标记，开始新一轮对话
    stoppedRef.current = false;

    let activeSessionId = currentSessionId;
    const wasNewSession = !activeSessionId;
    if (!activeSessionId) {
      activeSessionId = await createSession(content.slice(0, 50) || 'New Task');
    }

    if (mode === 'plan' && awaitingConfirmation.current) {
      awaitingConfirmation.current = false;
      const userMessage: Message = { role: 'user', content };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      await saveMessage(userMessage, activeSessionId);
      
      setLoading(true);
      try {
        // 这里始终传 false，让 AI 自己根据内容判断是否要调用 start_execution
        await processAgentLoop(newMessages, activeSessionId, false);
      } catch (error: any) {
        console.error("Agent Loop Error:", error);
        showAlert(error.message, { title: 'AI 助手出错了' });
        setMessages(prev => [...prev, { role: 'assistant', content: `[系统消息: ${error.message}]` }]);
      } finally {
        setLoading(false);
      }
      return activeSessionId;
    }

    let userMessage: Message = { role: 'user', content };

    if (files && files.length > 0) {
      // 构建多部分消息：用户文字与每个文件各自独立成块。
      // 这样可避免两个问题：
      //  ① 多个文件被合并进单个预览卡片（MessageRenderer 仅识别首个 FILE_METADATA 标记）；
      //  ② 用户输入的文字被混入文件卡片的展开预览中。
      // 每个文件的文本（已含 FILE_METADATA 头）作为独立 text part，渲染为独立卡片；
      // 其图片作为 image_url part 紧随其后并保持文档内顺序，便于 AI 理解图片在原文档的位置。
      const parts: any[] = [];
      // 用户输入的文字始终作为第一个独立 text part，与文件内容分离
      if (content.trim()) {
        parts.push({ type: 'text', text: content });
      }
      for (const f of files) {
        const fileText = (f?.content || '').trim();
        if (fileText) {
          parts.push({ type: 'text', text: f.content });
        }
        if (Array.isArray(f.images)) {
          f.images.forEach((img: string, idx: number) => {
            parts.push({ type: 'image_url', image_url: { url: img } });
            // 该图片已同步存入 db.attachments（见 ChatWindow.handleFileSelect），
            // 附带 attachment id 提示，使 AI 可通过 insert_image_into_note 引用到笔记中。
            const attachmentId = f.imageAttachmentIds?.[idx];
            if (attachmentId) {
              // AI_ONLY_HINT_PREFIX 标记此 part 仅供模型阅读——随消息一起发给 AI，
              // 但 MessageRenderer 会跳过渲染，不在聊天 UI 中显示给用户。
              parts.push({
                type: 'text',
                text: `${AI_ONLY_HINT_PREFIX}[上图已保存为附件，attachment id: ${attachmentId}。如需将此图插入笔记，请调用 insert_image_into_note 工具，image_source 参数传入 "attachment:${attachmentId}"]`,
              });
            }
          });
        }
      }
      if (parts.length > 0) {
        userMessage.content = parts;
      }
      // 无有效内容时保持原始 content（兜底）
    }

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    await saveMessage(userMessage, activeSessionId);
    setLoading(true);

    try {
      await processAgentLoop(newMessages, activeSessionId, false);
      // 首轮对话完成后，后台静默生成智能标题（不阻塞主流程，失败静默）
      if (wasNewSession) {
        void autoRenameSession(activeSessionId, content);
      }
    } catch (error: any) {
      console.error("Agent Loop Error:", error);
      let errorMsg = error.message;
      if (!settings?.apiKey || !settings?.baseUrl) {
        errorMsg = "请在设置中配置 AI 服务的 API Key 和请求地址。";
      } else if (errorMsg.includes('GenerateContentRequest.model')) {
        errorMsg = "模型名称配置可能有误，当前模型不支持工具调用，或需要加上 'models/' 前缀。";
      }
      showAlert(errorMsg, { title: 'AI 助手出错了' });
      setMessages(prev => [...prev, { role: 'assistant', content: `[系统提示: ${errorMsg}]` }]);
    } finally {
      setLoading(false);
      setStatus('');
    }
    
    return activeSessionId;
  };

  /**
   * 核心的 Agent 运行循环
   * 处理系统提示词组装、模型流式响应以及工具的连续调用和执行
   *
   * @param currentMessages - 当前上下文的消息列表
   * @param activeSessionId - 当前活跃的会话 ID
   * @param skipPlanning - 是否跳过计划阶段（用于已确认计划后直接执行）
   */
  const processAgentLoop = async (
    currentMessages: Message[],
    activeSessionId: string,
    skipPlanning: boolean = false
  ) => {
    if (!settings) return;

    const contextPrompt = getFullContextPrompt(currentContext);
    let systemPrompt = getSystemPromptWithContext(mode, contextPrompt);

    if (mode === 'plan' && !skipPlanning && planStatus !== 'confirmed') {
      systemPrompt += `

IMPORTANT REMINDER: You are in DEEP PLANNING MODE

Strict Workflow:
1. OUTPUT a detailed plan in text (use Chinese).
2. CALL the "present_plan" tool to tell the system your plan is ready for user review.
3. STOP and wait for the user to respond (do not call data tools yet).
4. AFTER the user confirms, you MUST call the "start_execution" tool BEFORE calling any other tools to begin the task.

IMPORTANT: Always respond in Chinese.
`;
    } else if (mode === 'plan' && skipPlanning) {
      systemPrompt += `

User has confirmed. You are now in EXECUTION phase. 
Proceed with calling tools to complete the task as planned.

IMPORTANT: Always respond in Chinese.
`;
    }

    // 注入联网工具的可用性状态：告诉模型本轮 web_search / read_url / 各百科工具是否可用（受总开关与各独立开关联动控制）
    systemPrompt += '\n\n' + buildWebToolsStatus(config);

    const messagesWithSystem = [
      { role: 'system' as const, content: systemPrompt },
      ...currentMessages
    ];

    let aiMessage: Message = { role: 'assistant', content: '' };
    
    setMessages(prev => [...prev, aiMessage]);
    setStatus('AI 正在思考...');

    const handleToolCallChunk = (toolCallChunks: any[]) => {
      // 首次进入工具调用：结束思考计时，冻结为最终耗时
      if (reasoningStartRef.current !== null && aiMessage.reasoningTimeMs === undefined) {
        aiMessage.reasoningTimeMs = Date.now() - reasoningStartRef.current;
      }
      if (!aiMessage.tool_calls) aiMessage.tool_calls = [];
      
      toolCallChunks.forEach(chunk => {
        const index = chunk.index ?? 0;
        if (!aiMessage.tool_calls![index]) {
          aiMessage.tool_calls![index] = {
            id: chunk.id,
            type: 'function',
            function: { name: chunk.function?.name || '', arguments: '' }
          };
        }
        if (chunk.function?.arguments) {
          aiMessage.tool_calls![index].function.arguments += chunk.function.arguments;
        }
      });
      
      setMessages(prev => {
        const newArr = [...prev];
        newArr[newArr.length - 1] = { ...aiMessage };
        return newArr;
      });
    };

    const handleChunk = (chunk: string) => {
      setStatus('AI 正在生成回复...');
      // 首次进入正文：结束思考计时，冻结为最终耗时
      if (reasoningStartRef.current !== null && aiMessage.reasoningTimeMs === undefined) {
        aiMessage.reasoningTimeMs = Date.now() - reasoningStartRef.current;
      }
      aiMessage.content += chunk;
      setMessages(prev => {
        const newArr = [...prev];
        newArr[newArr.length - 1] = { ...aiMessage };
        return newArr;
      });
    };

    const handleReasoningChunk = (chunk: string) => {
      // 首个思考分片：记录起始时间，用于计算「已思考 Xs」
      if (reasoningStartRef.current === null) reasoningStartRef.current = Date.now();
      aiMessage.reasoning_content = (aiMessage.reasoning_content ?? '') + chunk;
      setMessages(prev => {
        const newArr = [...prev];
        newArr[newArr.length - 1] = { ...aiMessage };
        return newArr;
      });
    };

    // 工具可用性过滤：
    //   - present_plan / start_execution 仅 plan 模式可见（act 模式过滤掉）
    //   - 「联网搜索 + 网页读取」为同一总开关：web_search 与 read_url 均需总开关开 + 后端 Key 已配置（isWebUsable）
    //   - 维基百科站内搜（search_wikipedia_web）无独立开关——联网可用即自带；原站 API 受独立开关 + 总开关联动约束
    const activeTools = ToolDefinitions.filter(t => {
      const n = t.function.name;
      if (n === 'present_plan' || n === 'start_execution') return mode === 'plan';
      if (n === 'web_search') return isWebSearchUsable(config);
      if (n === 'read_url') return isWebUsable(config);
      if (n === 'search_wikipedia_web') return isWebUsable(config);
      if (n === 'search_wikipedia') return isWikipediaOn(config);
      if (n === 'image_search') return isWebUsable(config);
      return true;
    });

    // 创建新的 AbortController 用于取消请求
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    // 重置本轮流式结束原因，用于后续判断输出是否被 max_tokens 截断
    finishReasonRef.current = null;
    // 重置思考计时，本轮若产生 reasoning_content 会在首个分片时记录起始时间
    reasoningStartRef.current = null;

    try {
      await streamAICompletion(
        messagesWithSystem,
        settings,
        handleChunk,
        activeTools,
        handleToolCallChunk,
        { maxTokens: settings.maxTokens, temperature: settings.temperature },
        abortController.signal,
        handleReasoningChunk,
        (reason) => { if (reason) finishReasonRef.current = reason; }
      );
    } catch (error: any) {
      // 如果是用户主动取消，不抛出错误
      if (error.name === 'AbortError') {
        setStatus('已停止');
        return;
      }
      throw error;
    } finally {
      // 思考已开始但未因正文/工具调用结束计时（如仅产出推理、被截断或用户停止）时，补全耗时
      if (reasoningStartRef.current !== null && aiMessage.reasoningTimeMs === undefined) {
        aiMessage.reasoningTimeMs = Date.now() - reasoningStartRef.current;
        setMessages(prev => {
          const newArr = [...prev];
          const lastIdx = newArr.findIndex(x => x === aiMessage);
          if (lastIdx !== -1) newArr[lastIdx] = { ...aiMessage };
          else newArr[newArr.length - 1] = { ...aiMessage };
          return newArr;
        });
      }
      reasoningStartRef.current = null;
    }
    
    setStatus('');

    // 用户已点击停止：立即中断，不再执行工具或递归
    if (stoppedRef.current) return;

    // 清理 tool_calls 中的稀疏空洞：部分 OpenAI 兼容供应商在流式工具调用时
    // index 缺失或跳跃，会导致数组出现 undefined 空洞，后续 for..of 遍历会抛
    // "Cannot read properties of undefined (reading 'function')"。
    if (aiMessage.tool_calls) {
      aiMessage.tool_calls = aiMessage.tool_calls.filter(
        (tc): tc is ToolCall => !!tc && !!tc.function
      );
    }

    // 冗余清理：处理某些模型（如 Gemini）在触发工具调用时，会将参数 JSON 误输出到 content 中的情况
    if (typeof aiMessage.content === 'string' && aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      // 如果内容以 { 开头并以 } 结尾（可能带换行），且长度较长，通常是冗余的 JSON
      const cleanedContent = aiMessage.content.replace(/^\{[\s\S]*?\}\s*/, '').trim();
      if (cleanedContent !== aiMessage.content) {
        aiMessage.content = cleanedContent;
        setMessages(prev => {
          const newArr = [...prev];
          const lastIdx = newArr.findIndex(m => m === aiMessage);
          if (lastIdx !== -1) {
            newArr[lastIdx] = { ...aiMessage };
          } else {
            newArr[newArr.length - 1] = { ...aiMessage };
          }
          return newArr;
        });
      }
    }

    // 纯文本回复被 max_tokens 截断时，追加可见提示（工具调用场景由上面的截断检测分支处理）
    if (finishReasonRef.current === 'length' && typeof aiMessage.content === 'string'
        && (!aiMessage.tool_calls || aiMessage.tool_calls.length === 0)) {
      aiMessage.content += '\n\n---\n✂️ **（回复因长度限制被截断，如需完整内容请回复"继续"）**';
      setMessages(prev => {
        const newArr = [...prev];
        const lastIdx = newArr.findIndex(m => m === aiMessage);
        if (lastIdx !== -1) newArr[lastIdx] = { ...aiMessage };
        else newArr[newArr.length - 1] = { ...aiMessage };
        return newArr;
      });
    }

    await saveMessage(aiMessage, activeSessionId);

    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const toolMessages: Message[] = [];
      // delegate_task 收集到此队列，待普通工具串行执行完后并行启动子 Agent
      const delegateCalls: ToolCall[] = [];
      // ask_user 标记：检测到后需提前退出循环等待用户交互
      let calledAskUser = false;
      
      for (const toolCall of aiMessage.tool_calls) {
        if (toolCall.function.name === 'present_plan') {
          setPlanStatus('pending');
          awaitingConfirmation.current = true;
          planExtractedRef.current = true;
          
          const waitText = '\n\n---\n⏳ **等待确认**：计划已推送，请回复"确认"或点击按钮开始执行。';
          if (typeof aiMessage.content === 'string') aiMessage.content += waitText;
          setMessages(prev => {
            const newArr = [...prev];
            newArr[newArr.length - 1] = { ...aiMessage };
            return newArr;
          });
        }
        
        if (toolCall.function.name === 'start_execution') {
          setPlanStatus('confirmed');
          awaitingConfirmation.current = false;
          skipPlanning = true;
        }

        // delegate_task：委派给独立子 Agent，不在此串行执行，收集到并行队列
        if (toolCall.function.name === 'delegate_task') {
          delegateCalls.push(toolCall);
          continue;
        }

        // ask_user：暂停执行循环，展示交互式提问卡片等待用户回答
        if (toolCall.function.name === 'ask_user') {
          calledAskUser = true;
          try {
            const args = parseToolArguments(toolCall.function.arguments);
            setAskState({ active: true, question: args.question, type: args.type || 'text', options: args.options, toolCallId: toolCall.id });
          } catch { /* parse failure, skip */ }
          continue;
        }

        // update_task_list：更新可视化的任务进度卡片
        if (toolCall.function.name === 'update_task_list') {
          try {
            const args = parseToolArguments(toolCall.function.arguments);
            if (args.items) setTodoList(args.items);
          } catch { /* ignore */ }
          // Fall through to executeTool
        }

        // 截断检测：当 finish_reason 为 'length' 且参数 JSON 结构不完整时，判定为被
        // max_tokens 截断。此时不执行（宽容解析虽可补全括号，但语义已残缺），改为回传
        // 明确引导，让 AI 用更小批次或增量工具（patch_quiz_questions / add_mindmap_elements）
        // 分批自愈，避免整个 Agent 循环因残缺数据崩溃或写入残缺内容。
        if (finishReasonRef.current === 'length' && !isJsonComplete(toolCall.function.arguments)) {
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify({
              error: 'tool_arguments_truncated',
              message: '参数 JSON 不完整（疑似因输出长度限制被截断），未执行。请缩减单次工具调用的内容体量，或改用增量工具（如 patch_quiz_questions 追加题目、add_mindmap_elements 追加节点、patch_note_content 追加笔记段落）分批完成，然后重新调用。'
            })
          });
          continue;
        }

        try {
          setStatus(`AI 正在执行工具: ${toolCall.function.name}...`);
          const result = await executeTool(toolCall);
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(result)
          });
        } catch (error: any) {
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify({ error: error.message })
          });
        }
      }

      // 并行执行所有 delegate_task：每个子 Agent 独立循环，互不阻塞
      if (delegateCalls.length > 0) {
        setStatus(`正在并行执行 ${delegateCalls.length} 个子任务…`);
        const delegateResults = await Promise.all(
          delegateCalls.map(async (tc) => {
            updateSubAgent(tc.id, { status: '启动子任务…', streamText: '', toolCalls: [], done: false });
            let args: any = {};
            try { args = parseToolArguments(tc.function.arguments || '{}'); } catch { /* 宽容解析失败则用空参数 */ }
            const callbacks: SubAgentCallbacks = {
              onStatus: (s) => updateSubAgent(tc.id, { status: s }),
              onChunk: (c) => updateSubAgent(tc.id, (s) => ({ streamText: s.streamText + c })),
              onToolCall: (n, a) => updateSubAgent(tc.id, (s) => ({ toolCalls: [...s.toolCalls, { name: n, args: a }] })),
            };
            try {
              const summary = await runSubAgent({
                task: args.task || '(未提供任务)',
                context: args.context,
                settings,
                signal: abortController.signal,
                callbacks,
              });
              updateSubAgent(tc.id, { done: true });
              return { toolCall: tc, content: summary };
            } catch (error: any) {
              updateSubAgent(tc.id, { done: true, status: '失败', error: error.message });
              return { toolCall: tc, content: `子任务失败: ${error.message || error}` };
            }
          })
        );
        setStatus('');
        for (const { toolCall, content } of delegateResults) {
          // Persist sub-agent internal tool calls alongside the summary,
          // so they remain visible after page reload.
          const state = subAgentStatesRef.current[toolCall.id];
          const persisted = JSON.stringify({
            summary: content,
            subToolCalls: state?.toolCalls || [],
            error: state?.error || undefined,
          });
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'delegate_task',
            content: persisted,
          });
        }
      }

      for (const tMsg of toolMessages) {
        await saveMessage(tMsg, activeSessionId);
      }

      setMessages(prev => [...prev, ...toolMessages]);

      const calledPresent = aiMessage.tool_calls.some(tc => tc.function.name === 'present_plan');
      if (calledPresent) return;
      if (calledAskUser) return;

      // 回传给 AI 前做两层清洗：
      //   1. delegate_task 结果中提取纯摘要（subToolCalls 是给 UI 用的，AI 不需要）
      //   2. 去除 _diff 字段（增量 diff 是给 UI 看的，AI 应基于 apply_diff 返回的最终状态理解变化）
      const toolMessagesForAI = toolMessages.map(m => {
        if (m.role === 'tool' && typeof m.content === 'string') {
          try {
            const parsed = JSON.parse(m.content);
            // delegate_task: extract summary string for the AI
            if (m.name === 'delegate_task' && parsed.summary !== undefined) {
              return { ...m, content: parsed.summary };
            }
            if (parsed._diff !== undefined) {
              const { _diff: _removed, ...rest } = parsed;
              return { ...m, content: JSON.stringify(rest) };
            }
          } catch {}
        }
        return m;
      });

      if (!stoppedRef.current) {
        await processAgentLoop([...currentMessages, aiMessage, ...toolMessagesForAI], activeSessionId, skipPlanning);
      }
    }
  };

  /**
   * 清空当前会话在内存中的状态
   */
  const clearSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setPlanStatus('none');
    setCurrentPlan('');
    awaitingConfirmation.current = false;
    planExtractedRef.current = false;
    setTodoList([]);
    setAskState(null);
    setSubAgentStates({});
  };

  /**
   * 手动确认当前的执行计划
   * 会将状态置为 confirmed，并向 AI 发送确认指令触发执行流
   */
  const confirmPlan = async () => {
    if (mode === 'plan' && planStatus === 'pending' && currentSessionId) {
      setPlanStatus('confirmed');
      awaitingConfirmation.current = false;
      
      const confirmMessage: Message = { role: 'user', content: '确认计划，开始执行' };
      const newMessages = [...messages, confirmMessage];
      setMessages(newMessages);
      await saveMessage(confirmMessage, currentSessionId);
      
      setLoading(true);
      try {
        await processAgentLoop(newMessages, currentSessionId, true);
      } catch (error: any) {
        console.error("Agent Loop Error:", error);
        showAlert(error.message, { title: 'AI 助手出错了' });
        setMessages(prev => [...prev, { role: 'assistant', content: `[系统提示: ${error.message}]` }]);
      } finally {
        setLoading(false);
      }
    }
  };

  /**
   * 手动拒绝当前的执行计划
   * 阻断当前计划的执行，重置状态以便用户输入新指令
   */
  const rejectPlan = () => {
    if (mode === 'plan' && planStatus === 'pending') {
      setPlanStatus('rejected');
      awaitingConfirmation.current = false;
    }
  };

  /**
   * 回答 AI 通过 ask_user 工具提出的问题。
   * 将用户的选择/输入作为工具结果回传给 AI，并继续 Agent 循环。
   *
   * @param answer - 用户回答内容（单选/文本为 string，多选为 string[]）
   */
  const answerAsk = async (answer: string | string[]) => {
    if (!askState?.active || !currentSessionId) return;

    const resolvedAnswer = Array.isArray(answer) ? answer.join(', ') : answer;
    const toolMsg: Message = {
      role: 'tool',
      tool_call_id: askState.toolCallId,
      name: 'ask_user',
      content: JSON.stringify({ answer: resolvedAnswer }),
    };

    setAskState(null);

    // Reconstruct the assistant message that contained ask_user
    const currentMsgs = [...messages];
    const lastAssistant = currentMsgs[currentMsgs.length - 1];
    if (lastAssistant?.role !== 'assistant') {
      // Safety: if the last message isn't the assistant, treat answer as user chat
      const userMsg: Message = { role: 'user', content: resolvedAnswer };
      setMessages(prev => [...prev, userMsg, toolMsg]);
      await saveMessage(userMsg, currentSessionId);
      await saveMessage(toolMsg, currentSessionId);
    } else {
      setMessages(prev => [...prev, toolMsg]);
      await saveMessage(toolMsg, currentSessionId);
    }

    setLoading(true);
    try {
      await processAgentLoop([...currentMsgs, toolMsg], currentSessionId, false);
    } catch (error: any) {
      console.error("Agent Loop Error:", error);
      showAlert(error.message, { title: 'AI 助手出错了' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * 停止当前的 AI 生成任务
   * 会取消正在进行的请求、阻止后续递归调用并重置加载状态
   */
  const stop = () => {
    stoppedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setStatus('已停止');
  };

  /**
   * 重试对话历史中的某一次用户提问
   * 截断该消息之后的所有对话，并基于截断后的历史重新发起请求
   *
   * @param index - 要重试的特定消息索引。如果不传，则默认重试最后一次用户的发言
   */
  const retry = async (index?: number) => {
    if (!currentSessionId || loading) return;

    // 确保任何残留的 Agent 循环被终止，重置停止标记
    stoppedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stoppedRef.current = false;

    let targetIndex = index;
    
    if (targetIndex === undefined) {
      const lastUserIndex = [...messages].reverse().findIndex(m => m.role === 'user');
      if (lastUserIndex === -1) return;
      targetIndex = messages.length - 1 - lastUserIndex;
    }

    if (targetIndex < 0 || targetIndex >= messages.length) return;
    if (messages[targetIndex].role !== 'user') return;
    
    const preservedMessages = messages.slice(0, targetIndex + 1);
    
    const allUserMsgs = await db.chatMessages
      .where('sessionId')
      .equals(currentSessionId)
      .filter(m => m.role === 'user')
      .sortBy('createdAt');
    
    const userMsgIndexInHistory = messages.slice(0, targetIndex + 1).filter(m => m.role === 'user').length - 1;
    const dbTarget = allUserMsgs[userMsgIndexInHistory];

    if (dbTarget) {
      await db.chatMessages
        .where('sessionId')
        .equals(currentSessionId)
        .filter(m => m.createdAt > dbTarget.createdAt)
        .delete();
    }

    setMessages(preservedMessages);
    setLoading(true);

    try {
      await processAgentLoop(preservedMessages, currentSessionId, mode === 'plan' && planStatus === 'confirmed');
    } catch (error: any) {
      console.error("Retry Error:", error);
      const errorMsg = error.message;
      showAlert(errorMsg, { title: '重试失败' });
      setMessages(prev => [...prev, { role: 'assistant', content: `[系统消息: ${errorMsg}]` }]);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return {
    messages,
    loading,
    status,
    currentSessionId,
    sendMessage,
    clearSession,
    retry,
    planStatus,
    currentPlan,
    confirmPlan,
    rejectPlan,
    stop,
    subAgentStates,
    todoList,
    askState,
    answerAsk,
  };
}
