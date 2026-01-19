import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogOptions {
  title?: string;
  message: string;
  type?: 'alert' | 'confirm' | 'prompt';
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
}

interface DialogContextType {
  showAlert: (message: string, options?: Partial<DialogOptions>) => Promise<void>;
  showConfirm: (message: string, options?: Partial<DialogOptions>) => Promise<boolean>;
  showPrompt: (message: string, defaultValue?: string, options?: Partial<DialogOptions>) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [resolvePromise, setResolvePromise] = useState<((value: any) => void) | null>(null);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setInputValue('');
    setResolvePromise(null);
  }, []);

  const handleConfirm = useCallback(() => {
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

  const showAlert = useCallback((message: string, options: Partial<DialogOptions> = {}) => {
    return new Promise<void>((resolve) => {
      setDialog({ ...options, message, type: 'alert' });
      setResolvePromise(() => resolve);
    });
  }, []);

  const showConfirm = useCallback((message: string, options: Partial<DialogOptions> = {}) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ ...options, message, type: 'confirm' });
      setResolvePromise(() => resolve);
    });
  }, []);

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
      {dialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md mx-4 border dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100">
                {dialog.title || (dialog.type === 'alert' ? '提示' : dialog.type === 'confirm' ? '确认' : '输入')}
              </h3>
              <button onClick={handleCancel} className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 bg-white dark:bg-zinc-900">
              <p className="text-zinc-600 dark:text-zinc-300 mb-4 whitespace-pre-wrap leading-relaxed">{dialog.message}</p>

              {dialog.type === 'prompt' && (
                <input
                  autoFocus
                  className="w-full border rounded-lg px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                />
              )}
            </div>

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
                className="px-4 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-lg transition-all shadow hover:shadow-md font-medium"
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
