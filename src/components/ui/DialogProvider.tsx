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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md mx-4 border dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100">
                {dialog.title || (dialog.type === 'alert' ? '提示' : dialog.type === 'confirm' ? '确认' : '输入')}
              </h3>
              <button onClick={handleCancel} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-slate-600 dark:text-slate-300 mb-4 whitespace-pre-wrap">{dialog.message}</p>
              
              {dialog.type === 'prompt' && (
                <input
                  autoFocus
                  className="w-full border rounded-lg px-4 py-2 bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                />
              )}
            </div>

            <div className="p-4 border-t dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50">
              {dialog.type !== 'alert' && (
                <button 
                  onClick={handleCancel}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  {dialog.cancelText || '取消'}
                </button>
              )}
              <button 
                onClick={handleConfirm}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
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
