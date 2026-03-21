import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * 对话框配置选项
 */
interface DialogOptions {
  title?: string;      // 标题
  message: string;     // 内容消息
  type?: 'alert' | 'confirm' | 'prompt'; // 对话框类型
  defaultValue?: string; // Prompt 模式下的默认输入值
  matchValue?: string;  // 只有当输入匹配此值时，确认按钮才可用（用于危险操作二次确认）
  confirmText?: string; // 确认按钮文本
  cancelText?: string;  // 取消按钮文本
  onConfirm?: (value?: string) => void; // 确认回调
  onCancel?: () => void; // 取消回调
}

/**
 * 对话框 Context 类型定义
 * 提供了基于 Promise 的异步调用方法
 */
interface DialogContextType {
  /** 显示警告框，点击确定后 resolve */
  showAlert: (message: string, options?: Partial<DialogOptions>) => Promise<void>;
  /** 显示确认框，返回布尔值表示用户是否点击了确定 */
  showConfirm: (message: string, options?: Partial<DialogOptions>) => Promise<boolean>;
  /** 显示输入框，返回字符串（输入值）或 null（点击取消） */
  showPrompt: (message: string, defaultValue?: string, options?: Partial<DialogOptions>) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

/**
 * 方便在组件中调用对话框的 Hook
 */
export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

/**
 * 全局对话框调度机制
 * 
 * 核心逻辑：
 * 1. 状态管理：维护当前正在显示的对话框配置（dialog）、输入框内容（inputValue）以及 Promise 的 resolve 函数。
 * 2. Promise 驱动：调用 showAlert/showConfirm/showPrompt 时会创建一个新的 Promise 并将其 resolve 句柄存入状态。
 * 3. 异步交互：当用户点击“确定”或“取消”时，触发对应的 handle 函数，调用 resolve 句柄并将结果返回给调用者，最后关闭对话框。
 * 4. UI 渲染：在应用顶层渲染一个高层级（z-index）的模态层。
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [resolvePromise, setResolvePromise] = useState<((value: any) => void) | null>(null);

  /**
   * 清除状态，关闭对话框
   */
  const closeDialog = useCallback(() => {
    setDialog(null);
    setInputValue('');
    setResolvePromise(null);
  }, []);

  /**
   * 处理确认操作
   * 根据不同类型返回不同的 Promise 结果
   */
  const handleConfirm = useCallback(() => {
    // 危险操作校验：如果设置了 matchValue，必须输入匹配才能确认
    if (dialog?.matchValue && inputValue !== dialog.matchValue) return;

    if (resolvePromise) {
      if (dialog?.type === 'prompt') {
        resolvePromise(inputValue);
      } else if (dialog?.type === 'confirm') {
        resolvePromise(true);
      } else {
        resolvePromise(undefined);
      }
    }
    dialog?.onConfirm?.(dialog.type === 'prompt' ? inputValue : undefined);
    closeDialog();
  }, [dialog, inputValue, resolvePromise, closeDialog]);

  /**
   * 处理取消或关闭操作
   */
  const handleCancel = useCallback(() => {
    if (resolvePromise) {
      if (dialog?.type === 'confirm') {
        resolvePromise(false);
      } else {
        resolvePromise(null);
      }
    }
    dialog?.onCancel?.();
    closeDialog();
  }, [dialog, resolvePromise, closeDialog]);

  // 公开方法：显示 Alert
  const showAlert = useCallback((message: string, options: Partial<DialogOptions> = {}) => {
    return new Promise<void>((resolve) => {
      setDialog({ ...options, message, type: 'alert' });
      setResolvePromise(() => resolve);
    });
  }, []);

  // 公开方法：显示 Confirm
  const showConfirm = useCallback((message: string, options: Partial<DialogOptions> = {}) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ ...options, message, type: 'confirm' });
      setResolvePromise(() => resolve);
    });
  }, []);

  // 公开方法：显示 Prompt
  const showPrompt = useCallback((message: string, defaultValue: string = '', options: Partial<DialogOptions> = {}) => {
    return new Promise<string | null>((resolve) => {
      setDialog({ ...options, message, defaultValue, type: 'prompt' });
      setInputValue(defaultValue);
      setResolvePromise(() => resolve);
    });
  }, []);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {/* 渲染当前激活的对话框 */}
      {dialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md mx-4 border dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* 对话框头部 */}
            <div className="p-4 border-b dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100">
                {dialog.title || (dialog.type === 'alert' ? '提示' : dialog.type === 'confirm' ? '确认' : '输入')}
              </h3>
              <button onClick={handleCancel} className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* 对话框主体内容 */}
            <div className="p-6 bg-white dark:bg-zinc-900">
              <p className="text-zinc-600 dark:text-zinc-300 mb-4 whitespace-pre-wrap leading-relaxed">{dialog.message}</p>

              {dialog.type === 'prompt' && (
                <input
                  autoFocus
                  className="w-full border rounded-lg px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (!dialog.matchValue || inputValue === dialog.matchValue) && handleConfirm()}
                  placeholder={dialog.matchValue ? `请输入 "${dialog.matchValue}" 以确认` : ""}
                />
              )}
            </div>

            {/* 底部操作按钮区域 */}
            <div className="p-4 border-t dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/50">
              {dialog.type !== 'alert' && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors font-medium"
                >
                  {dialog.cancelText || '取消'}
                </button>
              )}
              <button
                onClick={handleConfirm}
                disabled={dialog.type === 'prompt' && !!dialog.matchValue && inputValue !== dialog.matchValue}
                className="px-4 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-lg transition-all shadow hover:shadow-md font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
              >
                {dialog.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
