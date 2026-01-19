import { X } from 'lucide-react';
import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh] pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
                <button onClick={onClose} className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                {children}
              </div>
              {footer && (
                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2 shrink-0">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
