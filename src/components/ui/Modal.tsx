import { X } from 'lucide-react';
import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * 模态框组件属性
 */
interface ModalProps {
  isOpen: boolean;    // 是否打开
  onClose: () => void; // 关闭回调
  title: string;      // 模态框标题
  children: ReactNode; // 主体内容
  footer?: ReactNode;  // 底部操作区域（可选）
}

/**
 * 通用模态框组件
 * 
 * 核心功能：
 * 1. 动画效果：使用 framer-motion 实现背景遮罩的淡入淡出和窗口的缩放/位移过渡。
 * 2. 交互处理：点击背景遮罩可触发关闭，点击窗口内部则阻止事件冒泡。
 * 3. 布局适配：支持内容区域垂直滚动，最大高度限制为视口的 90%。
 * 4. 结构化：包含清晰的头部（标题+关闭按钮）、主体内容区和可选的底部按钮区。
 */
export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
          
          {/* 模态框容器 - 居中定位 */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh] pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部：标题与关闭按钮 */}
              <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
                <button onClick={onClose} className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                  <X size={20} />
                </button>
              </div>

              {/* 内容主体 - 支持内部滚动 */}
              <div className="p-4 overflow-y-auto">
                {children}
              </div>

              {/* 底部按钮区域（如果提供） */}
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
