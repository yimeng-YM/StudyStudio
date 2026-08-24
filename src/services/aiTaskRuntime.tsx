import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Message } from '@/services/ai';
import type {
  AskState,
  PlanStatus,
  SubAgentState,
  TodoItem,
} from '@/hooks/useChatSession';
import { getFullContextPrompt, useAIStore } from '@/store/useAIStore';

const BackgroundTaskRunner = lazy(() => import('./AIBackgroundTaskRunner'));

export type AITaskMode = 'act' | 'plan' | 'research';
export type AITaskPhase =
  | 'idle'
  | 'running'
  | 'waiting_user'
  | 'completed'
  | 'stopped'
  | 'error';

export interface AIInputFile {
  name: string;
  size: number;
  content: string;
  images?: string[];
  imageAttachmentIds?: string[];
}

export interface AITaskSnapshot {
  sessionId: string;
  mode: AITaskMode;
  messages: Message[];
  loading: boolean;
  hydrated: boolean;
  status: string;
  phase: AITaskPhase;
  planStatus: PlanStatus;
  currentPlan: string;
  subAgentStates: Record<string, SubAgentState>;
  todoList: TodoItem[];
  askState: AskState | null;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

interface SendInput {
  content: string;
  files?: AIInputFile[];
  hiddenContext?: string;
  newSession?: boolean;
  contextPrompt?: string;
}

export interface AITaskController extends AITaskSnapshot {
  sendMessage: (input: SendInput) => Promise<void>;
  retry: (index?: number) => Promise<void>;
  stop: () => void;
  answerAsk: (answer: string | string[]) => Promise<void>;
}

interface AIBackgroundRuntimeValue {
  controllers: Record<string, AITaskController>;
  snapshots: Record<string, AITaskSnapshot>;
  runningCount: number;
  waitingCount: number;
  attachSession: (sessionId: string, mode?: AITaskMode) => void;
  detachSession: (sessionId: string) => void;
  sendMessage: (
    sessionId: string,
    mode: AITaskMode,
    input: SendInput,
  ) => Promise<void>;
  retry: (sessionId: string, index?: number) => Promise<void>;
  stop: (sessionId: string) => void;
  answerAsk: (sessionId: string, answer: string | string[]) => Promise<void>;
}

const AIBackgroundRuntimeContext = createContext<AIBackgroundRuntimeValue | null>(null);

interface PendingSend extends SendInput {
  resolve: () => void;
  reject: (error: unknown) => void;
}

export interface BackgroundTaskRunnerProps {
  sessionId: string;
  mode: AITaskMode;
  contextPrompt: string;
  onReady: (sessionId: string, controller: AITaskController) => void;
  onSnapshot: (snapshot: AITaskSnapshot) => void;
}

export function AIBackgroundRuntimeProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Record<string, { mode: AITaskMode; contextPrompt: string }>>({});
  const [snapshots, setSnapshots] = useState<Record<string, AITaskSnapshot>>({});
  const [controllerVersion, setControllerVersion] = useState(0);
  const controllersRef = useRef<Record<string, AITaskController>>({});
  const pendingSendsRef = useRef<Record<string, PendingSend[]>>({});

  const attachSession = useCallback((sessionId: string, mode: AITaskMode = 'act') => {
    const contextPrompt = getFullContextPrompt(useAIStore.getState().currentContext);
    setSessions(current => current[sessionId]?.mode === mode
      ? current
      : { ...current, [sessionId]: { mode, contextPrompt } });
  }, []);

  const detachSession = useCallback((sessionId: string) => {
    const snapshot = snapshots[sessionId];
    if (snapshot?.loading) return;
    setSessions(current => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    setSnapshots(current => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    delete controllersRef.current[sessionId];
  }, [snapshots]);

  const flushPendingSends = useCallback((sessionId: string, controller: AITaskController) => {
    const queue = pendingSendsRef.current[sessionId];
    if (!queue?.length || controller.loading) return;
    const next = queue.shift();
    if (!next) return;
    void controller.sendMessage(next).then(next.resolve, next.reject);
    if (queue.length === 0) delete pendingSendsRef.current[sessionId];
  }, []);

  const handleReady = useCallback((sessionId: string, controller: AITaskController) => {
    if (controllersRef.current[sessionId]) {
      // The controller methods delegate to a session ref, so the first registered
      // controller stays valid even as the underlying session state changes.
      return;
    }
    controllersRef.current[sessionId] = controller;
    // Controllers are stored in a ref so callbacks can always read the latest value,
    // but the UI also needs to be notified when a controller is registered.
    // Bumping this version forces controllers to be recomputed with the fresh ref.
    setControllerVersion(v => v + 1);
    flushPendingSends(sessionId, controller);
  }, [flushPendingSends]);

  const handleSnapshot = useCallback((snapshot: AITaskSnapshot) => {
    setSnapshots(current => current[snapshot.sessionId] === snapshot
      ? current
      : { ...current, [snapshot.sessionId]: snapshot });
  }, []);

  const sendMessage = useCallback((
    sessionId: string,
    mode: AITaskMode,
    input: SendInput,
  ) => {
    if (pendingSendsRef.current[sessionId]?.length) {
      return Promise.reject(new Error('该会话正在准备 AI 任务，请稍候。'));
    }
    const contextPrompt = getFullContextPrompt(useAIStore.getState().currentContext);
    attachSession(sessionId, mode);
    const controller = controllersRef.current[sessionId];
    if (controller?.hydrated && controller.loading) {
      return Promise.reject(new Error('该会话已有 AI 任务正在运行，请等待完成或先停止当前任务。'));
    }
    // 立即登记为运行中：动态执行器尚在加载时，悬浮徽标、历史列表和删除保护
    // 也能同步生效，并阻止同一会话被连续点击后重复排队。
    setSnapshots(current => {
      const existing = current[sessionId];
      return {
        ...current,
        [sessionId]: existing
          ? { ...existing, mode, loading: true, status: '准备后台任务…', phase: 'running' }
          : {
              sessionId,
              mode,
              messages: [],
              loading: true,
              hydrated: false,
              status: '准备后台任务…',
              phase: 'running',
              planStatus: 'none',
              currentPlan: '',
              subAgentStates: {},
              todoList: [],
              askState: null,
              startedAt: Date.now(),
            },
      };
    });
    const scopedInput = { ...input, contextPrompt };
    if (controller?.hydrated) {
      return controller.sendMessage(scopedInput);
    }

    return new Promise<void>((resolve, reject) => {
      const queue = pendingSendsRef.current[sessionId] ?? [];
      queue.push({ ...scopedInput, resolve, reject });
      pendingSendsRef.current[sessionId] = queue;
    });
  }, [attachSession]);

  const retry = useCallback(async (sessionId: string, index?: number) => {
    await controllersRef.current[sessionId]?.retry(index);
  }, []);

  const stop = useCallback((sessionId: string) => {
    controllersRef.current[sessionId]?.stop();
  }, []);

  const answerAsk = useCallback(async (sessionId: string, answer: string | string[]) => {
    await controllersRef.current[sessionId]?.answerAsk(answer);
  }, []);

  const controllers = useMemo(() => {
    const result: Record<string, AITaskController> = {};
    for (const [sessionId, snapshot] of Object.entries(snapshots)) {
      const controller = controllersRef.current[sessionId];
      if (controller) result[sessionId] = { ...controller, ...snapshot };
    }
    return result;
  }, [snapshots, controllerVersion]);

  const runningCount = Object.values(snapshots).filter(task => task.loading).length;
  const waitingCount = Object.values(snapshots).filter(task => task.phase === 'waiting_user').length;
  const value = useMemo<AIBackgroundRuntimeValue>(() => ({
    controllers,
    snapshots,
    runningCount,
    waitingCount,
    attachSession,
    detachSession,
    sendMessage,
    retry,
    stop,
    answerAsk,
  }), [
    controllers,
    snapshots,
    runningCount,
    waitingCount,
    attachSession,
    detachSession,
    sendMessage,
    retry,
    stop,
    answerAsk,
  ]);

  return (
    <AIBackgroundRuntimeContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {Object.entries(sessions).map(([sessionId, task]) => (
          <BackgroundTaskRunner
            key={sessionId}
            sessionId={sessionId}
            mode={task.mode}
            contextPrompt={task.contextPrompt}
            onReady={handleReady}
            onSnapshot={handleSnapshot}
          />
        ))}
      </Suspense>
    </AIBackgroundRuntimeContext.Provider>
  );
}

export function useAIBackgroundRuntime() {
  const value = useContext(AIBackgroundRuntimeContext);
  if (!value) throw new Error('useAIBackgroundRuntime must be used inside AIBackgroundRuntimeProvider');
  return value;
}

export function useAITask(sessionId: string | null) {
  const runtime = useAIBackgroundRuntime();
  return sessionId ? runtime.controllers[sessionId] ?? null : null;
}
