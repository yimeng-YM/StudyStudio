import { useEffect, useMemo, useRef } from 'react';
import { useChatSession, type AskState, type PlanStatus } from '@/hooks/useChatSession';
import type {
  AITaskController,
  AITaskPhase,
  AITaskSnapshot,
  BackgroundTaskRunnerProps,
} from './aiTaskRuntime';

function getPhase(
  loading: boolean,
  status: string,
  askState: AskState | null,
  planStatus: PlanStatus,
  previous?: AITaskSnapshot,
): AITaskPhase {
  if (loading) return 'running';
  if (askState?.active || planStatus === 'pending') return 'waiting_user';
  if (status === '已停止') return 'stopped';
  if (status === '失败') return 'error';
  if (previous?.phase === 'running') return 'completed';
  return previous?.phase ?? 'idle';
}

export default function AIBackgroundTaskRunner({
  sessionId,
  mode,
  contextPrompt,
  onReady,
  onSnapshot,
}: BackgroundTaskRunnerProps) {
  const session = useChatSession(sessionId, mode, contextPrompt);
  const previousRef = useRef<AITaskSnapshot>();
  const startedAtRef = useRef<number>();
  const completedAtRef = useRef<number>();

  if (session.loading && !startedAtRef.current) startedAtRef.current = Date.now();

  const phase = getPhase(
    session.loading,
    session.status,
    session.askState,
    session.planStatus,
    previousRef.current,
  );
  if (
    (phase === 'completed' || phase === 'stopped' || phase === 'error')
    && previousRef.current?.phase !== phase
  ) {
    completedAtRef.current = Date.now();
  }

  const snapshot = useMemo<AITaskSnapshot>(() => ({
    sessionId,
    mode,
    messages: session.messages,
    loading: session.loading,
    hydrated: session.hydrated,
    status: session.status,
    phase,
    planStatus: session.planStatus,
    currentPlan: session.currentPlan,
    subAgentStates: session.subAgentStates,
    todoList: session.todoList,
    askState: session.askState,
    startedAt: startedAtRef.current,
    completedAt: completedAtRef.current,
  }), [
    sessionId,
    mode,
    session.messages,
    session.loading,
    session.hydrated,
    session.status,
    phase,
    session.planStatus,
    session.currentPlan,
    session.subAgentStates,
    session.todoList,
    session.askState,
  ]);

  const controller = useMemo<AITaskController>(() => ({
    ...snapshot,
    sendMessage: async ({ content, files = [], hiddenContext = '', newSession = false, contextPrompt: taskContextPrompt }) => {
      await session.sendMessage(content, files, hiddenContext, newSession, taskContextPrompt);
    },
    retry: session.retry,
    stop: session.stop,
    answerAsk: session.answerAsk,
  }), [snapshot, session.sendMessage, session.retry, session.stop, session.answerAsk]);

  useEffect(() => {
    previousRef.current = snapshot;
    onSnapshot(snapshot);
  }, [onSnapshot, snapshot]);

  useEffect(() => {
    if (!session.hydrated) return;
    // hydration 的 state 更新需要一次 React 提交才能进入闭包；延后一轮注册，
    // 保证首条后台发送基于完整的历史 messages，而不是加载前的空数组。
    const timer = window.setTimeout(() => onReady(sessionId, controller), 0);
    return () => window.clearTimeout(timer);
  }, [controller, onReady, session.hydrated, sessionId]);

  return null;
}
