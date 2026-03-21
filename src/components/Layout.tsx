import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAIStore } from '@/store/useAIStore';
import { AnimatePresence, motion } from 'framer-motion';
import { AIFloatingWindow } from './AIFloatingWindow';

/**
 * 应用主布局组件
 * 
 * 核心功能：
 * 1. 结构编排：组合侧边栏 (Sidebar)、主内容区域 (main) 和全局 AI 悬浮窗 (AIFloatingWindow)。
 * 2. 路由过渡：使用 framer-motion 实现页面切换时的平滑淡入淡出和位移动画。
 * 3. 初始化：在组件挂载时调用 loadSettings 加载全局 AI 配置（如 API Key、模型选择等）。
 */
export function Layout() {
  const { loadSettings } = useAIStore();
  const location = useLocation();

  // 组件初始化时加载设置
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <div className="flex h-screen w-full bg-white dark:bg-black overflow-hidden">
      {/* 侧边栏 */}
      <Sidebar />

      {/* 主内容区域 */}
      <main className="flex-1 overflow-hidden bg-white dark:bg-black relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full w-full overflow-hidden"
          >
            {/* 渲染子路由内容 */}
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 全局 AI 助手悬浮窗 */}
      <AIFloatingWindow />
    </div>
  );
}
