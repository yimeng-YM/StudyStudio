import { useState, useEffect, useRef } from 'react';
import { db } from '@/db';
import { Message, streamAICompletion } from '@/services/ai';
import { useAIStore, getFullContextPrompt } from '@/store/useAIStore';
import { ToolDefinitions, executeTool } from '@/services/agent/ToolRegistry';
import { useDialog } from '@/components/ui/DialogProvider';
import {
  getSystemPromptWithContext,
  DEFAULT_MAX_TOKENS
} from '@/services/promptConfig';

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
 * 管理 AI 聊天会话状态及核心执行流的 Hook
 * 处理消息存储、Agent 循环、工具调用及计划（Plan）模式的特殊工作流
 *
 * @param sessionId - 当前会话 ID，为 null 时表示新建会话
 * @param mode - 会话运行模式：'plan'（带确认的计划模式）或 'act'（直接执行模式）
 * @returns 包含消息列表、加载状态、计划状态及会话控制方法的对象
 */
export function useChatSession(sessionId: string | null, mode: 'plan' | 'act') {
  const { settings, currentContext } = useAIStore();
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
          reasoning_content: m.reasoning_content
        })));
      });
    } else {
      setCurrentSessionId(null);
      setMessages([]);
      setPlanStatus('none');
      setCurrentPlan('');
      awaitingConfirmation.current = false;
      planExtractedRef.current = false;
    }
  }, [sessionId]);

  /**
   * 创建新的对话会话
   *
   * @param title - 会话的初始标题
   * @returns 新创建的会话 ID
   */
  const createSession = async (title: string) => {
    const newSessionId = crypto.randomUUID();
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
      id: crypto.randomUUID(),
      sessionId: sId,
      role: msg.role as any,
      content: msg.content,
      name: msg.name,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      reasoning_content: msg.reasoning_content,
      createdAt: Date.now()
    });
    
    await db.chatSessions.update(sId, { updatedAt: Date.now() });
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
    
    let activeSessionId = currentSessionId;
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

    const userMessage: Message = { role: 'user', content };
    if (files && files.length > 0) {
      const parts: any[] = [{ type: 'text', text: content }];
      files.forEach(f => {
        if (f.images) {
          f.images.forEach((img: string) => {
            parts.push({ type: 'image_url', image_url: { url: img } });
          });
        }
      });
      userMessage.content = parts;
    }

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    await saveMessage(userMessage, activeSessionId);
    setLoading(true);

    try {
      await processAgentLoop(newMessages, activeSessionId, false);
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

    const messagesWithSystem = [
      { role: 'system' as const, content: systemPrompt },
      ...currentMessages
    ];

    let aiMessage: Message = { role: 'assistant', content: '' };
    
    setMessages(prev => [...prev, aiMessage]);
    setStatus('AI 正在思考...');

    const handleToolCallChunk = (toolCallChunks: any[]) => {
      if (!aiMessage.tool_calls) aiMessage.tool_calls = [];
      
      toolCallChunks.forEach(chunk => {
        const index = chunk.index;
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
      aiMessage.content += chunk;
      setMessages(prev => {
        const newArr = [...prev];
        newArr[newArr.length - 1] = { ...aiMessage };
        return newArr;
      });
    };

    const handleReasoningChunk = (chunk: string) => {
      aiMessage.reasoning_content = (aiMessage.reasoning_content ?? '') + chunk;
    };

    const activeTools = mode === 'act' 
      ? ToolDefinitions.filter(t => t.function.name !== 'present_plan' && t.function.name !== 'start_execution')
      : ToolDefinitions;

    // 创建新的 AbortController 用于取消请求
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await streamAICompletion(
        messagesWithSystem,
        settings,
        handleChunk,
        activeTools,
        handleToolCallChunk,
        { maxTokens: DEFAULT_MAX_TOKENS },
        abortController.signal,
        handleReasoningChunk
      );
    } catch (error: any) {
      // 如果是用户主动取消，不抛出错误
      if (error.name === 'AbortError') {
        setStatus('已停止');
        return;
      }
      throw error;
    } finally {
      abortControllerRef.current = null;
    }
    
    setStatus('');

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

    await saveMessage(aiMessage, activeSessionId);

    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const toolMessages: Message[] = [];
      
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

      for (const tMsg of toolMessages) {
        await saveMessage(tMsg, activeSessionId);
      }

      setMessages(prev => [...prev, ...toolMessages]);

      const calledPresent = aiMessage.tool_calls.some(tc => tc.function.name === 'present_plan');
      if (calledPresent) return;

      // 去除 _diff 字段后再回传给 AI，避免无效 token 消耗
      const toolMessagesForAI = toolMessages.map(m => {
        if (m.role === 'tool' && typeof m.content === 'string') {
          try {
            const parsed = JSON.parse(m.content);
            if (parsed._diff !== undefined) {
              const { _diff: _removed, ...rest } = parsed;
              return { ...m, content: JSON.stringify(rest) };
            }
          } catch {}
        }
        return m;
      });

      await processAgentLoop([...currentMessages, aiMessage, ...toolMessagesForAI], activeSessionId, skipPlanning);
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
   * 停止当前的 AI 生成任务
   * 会取消正在进行的请求并重置加载状态
   */
  const stop = () => {
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
  };
}
