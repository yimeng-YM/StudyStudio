import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { DialogProvider } from '@/components/ui/DialogProvider';
import { SortProvider } from '@/hooks/useSorting';
import { useStudyLogger } from '@/hooks/useStudyLogger';
import { initFontSize } from '@/hooks/useFontSize';

// 以下三个 hook 在其模块加载时即写 DOM（主题 class / 背景与强调色 CSS 变量），以避免首屏闪烁。
// Settings 改为懒加载后，这些模块不再随启动加载，需在入口静态引入以确保刷新时仍随首屏执行。
import '@/hooks/useTheme';
import '@/hooks/useBackground';
import '@/hooks/useAccentTheme';

// 路由级懒加载：首屏只需 Dashboard，其余页面（含思维导图 / 题库 / AI 等）按需加载，
// 显著减小首屏 bundle，加快新人首次打开速度。
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const SubjectView = lazy(() => import('@/pages/SubjectView').then(m => ({ default: m.SubjectView })));
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const AIChat = lazy(() => import('@/pages/AIChat').then(m => ({ default: m.AIChat })));
const Docs = lazy(() => import('@/pages/Docs').then(m => ({ default: m.Docs })));
const MobileSubjects = lazy(() => import('@/pages/mobile/MobileSubjects').then(m => ({ default: m.MobileSubjects })));

/**
 * 应用根组件
 *
 * 核心逻辑：
 * 1. 路由体系结构：使用 React Router 的 HashRouter 实现单页应用路由，通过 Layout 组件进行页面嵌套布局。
 * 2. 全局 Context Providers 层级组织：
 *    - DialogProvider: 提供全局模态框和通知服务，位于最外层以确保其覆盖所有 UI。
 *    - HashRouter: 路由上下文，负责解析 URL 并分发给对应的页面组件。
 *    - useStudyLogger: 全局钩子，用于初始化和监听用户学习行为日志。
 *    - initFontSize: 一次性初始化，从 localStorage 读取字体设置并写入 CSS 变量。
 *
 * @returns {JSX.Element} App 根组件
 */
function App() {
  useStudyLogger();
  useEffect(() => {
    initFontSize();
    // 当 App 渲染完成，或者首屏主要组件加载完成后，淡出并移除开屏动画
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.visibility = 'hidden';
      // 动画结束后从 DOM 彻底移除，释放内存
      setTimeout(() => {
        splash.remove();
      }, 300);
    }
  }, []); // 初始化全局字体 CSS 变量并移除开屏

  return (
    <SortProvider>
      <DialogProvider>
        <HashRouter>
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-zinc-400">加载中…</div>}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="subjects" element={<MobileSubjects />} />
              <Route path="subject/:id" element={<SubjectView />} />
              <Route path="settings" element={<Settings />} />
              <Route path="ai-chat" element={<AIChat />} />
              <Route path="docs" element={<Docs />} />
            </Route>
          </Routes>
          </Suspense>
        </HashRouter>
      </DialogProvider>
    </SortProvider>
  );
}

export default App;
