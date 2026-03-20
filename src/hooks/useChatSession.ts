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

// 计划状态类型
export type PlanStatus = 'none' | 'pending' | 'confirmed' | 'rejected';

// 计划信息接口
export interface PlanInfo {
  status: PlanStatus;
  content: string;
  steps: string[];
}

export function useChatSession(sessionId: string | null, mode: 'plan' | 'act') {
  const { settings, currentContext } = useAIStore();
  const { showAlert } = useDialog();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>(''); // AI 当前状态描述
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId);
  
  // Plan 模式相关状态
  const [planStatus, setPlanStatus] = useState<PlanStatus>('none');
  const [currentPlan, setCurrentPlan] = useState<string>('');
  const awaitingConfirmation = useRef(false);
  const planExtractedRef = useRef(false);

  // Load messages when sessionId changes
  useEffect(() => {
    if (sessionId) {
      setCurrentSessionId(sessionId);
      db.chatMessages.where('sessionId').equals(sessionId).sortBy('createdAt').then(msgs => {
        setMessages(msgs.map(m => ({
          role: m.role as any,
          content: m.content,
          name: m.name,
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id
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

  const saveMessage = async (msg: Message, sId: string) => {
    await db.chatMessages.add({
      id: crypto.randomUUID(),
      sessionId: sId,
      role: msg.role as any,
      content: msg.content,
      name: msg.name,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      createdAt: Date.now()
    });
    
    await db.chatSessions.update(sId, { updatedAt: Date.now() });
  };



  const sendMessage = async (content: string, files: any[] = []) => {
    if (!settings?.apiKey || !settings?.baseUrl) {
      showAlert("请在设置中配置 AI 服务的 API Key 和请求地址。", { title: '缺少配置' });
      return;
    }
    
    let activeSessionId = currentSessionId;
    if (!activeSessionId) {
      activeSessionId = await createSession(content.slice(0, 50) || 'New Task');
    }

    // Plan 模式下的特殊处理
    if (mode === 'plan' && awaitingConfirmation.current) {
      // 用户回复了（确认、修正或拒绝计划）
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
    // If files are provided, format them according to MessageContentPart
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

    // 新对话时不重置 planStatus，除非从 act 模式完全切回 plan 模式
    // 此处简化处理：主要依赖 sendMessage 中的 context 合并

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

  const processAgentLoop = async (
    currentMessages: Message[], 
    activeSessionId: string,
    skipPlanning: boolean = false
  ) => {
    if (!settings) return;

    // 使用统一的提示词配置
    const contextPrompt = getFullContextPrompt(currentContext);
    let systemPrompt = getSystemPromptWithContext(mode, contextPrompt);

    // Plan 模式且尚未确认时的特殊处理
    if (mode === 'plan' && !skipPlanning && planStatus !== 'confirmed') {
      // Reinforced planning mode prompt
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
      // User confirmed, allowed to execute
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

    let aiMessage: Message = { role: 'assistant', content: '', tool_calls: [] };
    
    setMessages(prev => [...prev, aiMessage]);
    setStatus('AI 正在思考...');

    // 移除硬编码拦截逻辑

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

    await streamAICompletion(
      messagesWithSystem, 
      settings, 
      handleChunk, 
      ToolDefinitions, 
      handleToolCallChunk,
      { maxTokens: DEFAULT_MAX_TOKENS }
    );
    
    setStatus('');
    await saveMessage(aiMessage, activeSessionId);

    // If there are tool calls, execute them and continue loop
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const toolMessages: Message[] = [];
      
      for (const toolCall of aiMessage.tool_calls) {
        // 特殊处理流程控制工具
        if (toolCall.function.name === 'present_plan') {
          setPlanStatus('pending');
          awaitingConfirmation.current = true;
          planExtractedRef.current = true;
          
          // 给用户一个视觉反馈
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
          skipPlanning = true; // 确保后续递归中 skipPlanning 为 true
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
      
      // 如果调用了 present_plan，则停止循环等待用户
      const calledPresent = aiMessage.tool_calls.some(tc => tc.function.name === 'present_plan');
      if (calledPresent) return;

      // Continue the loop
      await processAgentLoop([...currentMessages, aiMessage, ...toolMessages], activeSessionId, skipPlanning);
    }
  };

  const clearSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setPlanStatus('none');
    setCurrentPlan('');
    awaitingConfirmation.current = false;
    planExtractedRef.current = false;
  };

  // 手动确认计划的方法
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

  // 手动拒绝计划的方法
  const rejectPlan = () => {
    if (mode === 'plan' && planStatus === 'pending') {
      setPlanStatus('rejected');
      awaitingConfirmation.current = false;
    }
  };

  // 重试功能
  const retry = async (index?: number) => {
    if (!currentSessionId || loading) return;

    let targetIndex = index;
    
    // 如果没有传索引，默认找到最后一条 user 消息的索引
    if (targetIndex === undefined) {
      const lastUserIndex = [...messages].reverse().findIndex(m => m.role === 'user');
      if (lastUserIndex === -1) return;
      targetIndex = messages.length - 1 - lastUserIndex;
    }

    if (targetIndex < 0 || targetIndex >= messages.length) return;
    if (messages[targetIndex].role !== 'user') return;
    
    // 要保留的消息 (包含该索引处的 user 消息)
    const preservedMessages = messages.slice(0, targetIndex + 1);
    
    // 删除该 session 下 createdAt 大于该 user 消息的所有消息
    // 简化逻辑：找到该 session 下所有 user 消息，匹配第 N 个
    const allUserMsgs = await db.chatMessages
      .where('sessionId')
      .equals(currentSessionId)
      .filter(m => m.role === 'user')
      .sortBy('createdAt');
    
    // 找到对应索引的那条消息在 DB 中的位置
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
      // 重新进入循环
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
    // Plan 模式相关
    planStatus,
    currentPlan,
    confirmPlan,
    rejectPlan,
  };
}
