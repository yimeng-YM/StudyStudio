import { lazy, Suspense, useEffect, Component } from 'react';
import type { ComponentType, ReactNode, ErrorInfo } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { DialogProvider } from '@/components/ui/DialogProvider';
import { SortProvider } from '@/hooks/useSorting';
import { useStudyLogger } from '@/hooks/useStudyLogger';
import { initFontSize } from '@/hooks/useFontSize';
import { isChunkLoadError, reloadOnChunkError } from '@/lib/chunkLoadError';

// 以下三个 hook 在其模块加载时即写 DOM（主题 class / 背景与强调色 CSS 变量），以避免首屏闪烁。
// Settings 改为懒加载后，这些模块不再随启动加载，需在入口静态引入以确保刷新时仍随首屏执行。
import '@/hooks/useTheme';
import '@/hooks/useBackground';
import '@/hooks/useAccentTheme';

/** 可恢复的动态导入包装器：
 *  - chunk 加载失败时不再重复请求同一条损坏的缓存记录，而是强制回源修复后刷新入口
 *  - 非 chunk 异常保留短暂重试，兼容开发环境的瞬时模块加载失败
 *  - 触发页面恢复后保持 pending，让 Suspense 停留在加载态直至浏览器完成跳转
 */
function retryImport<T>(importFn: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryLoad = () => {
      importFn()
        .then(resolve)
        .catch(async err => {
          if (isChunkLoadError(err)) {
            const recovering = await reloadOnChunkError(err);
            if (recovering) return;
            reject(err);
            return;
          }
          if (++attempt < maxRetries) {
            console.warn(`[lazy load] 重试 ${attempt}/${maxRetries}…`, String(err).slice(0, 120));
            setTimeout(tryLoad, delayMs);
          } else {
            reject(err);
          }
        });
    };
    tryLoad();
  });
}

/** 页面加载失败时的错误边界：显示提示并提供刷新按钮，避免白屏/黑屏 */
class PageLoadErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PageLoadError]', error, info.componentStack);
    // React.lazy 的拒绝会被错误边界捕获，不一定触发 window.unhandledrejection，
    // 因此页面级 chunk 的恢复必须在这里显式兜底。
    void reloadOnChunkError(error);
  }

  private handleReload = () => {
    const { error } = this.state;
    if (error && isChunkLoadError(error)) {
      void reloadOnChunkError(error, { force: true }).then((recovering) => {
        if (!recovering) window.location.reload();
      });
      return;
    }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-sm text-zinc-500 gap-3 p-8">
          <p>页面加载失败，请刷新后重试</p>
          <button
            onClick={this.handleReload}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** 创建带重试的 lazy 组件（仅用于页面级路由） */
function lazyPage<T extends ComponentType<any>>(importFn: () => Promise<{ default: T }>) {
  return lazy(() => retryImport(importFn));
}

// 路由级懒加载：首屏只需 Dashboard，其余页面（含思维导图 / 题库 / AI 等）按需加载，
// 显著减小首屏 bundle，加快新人首次打开速度。
const Dashboard = lazyPage(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const SubjectView = lazyPage(() => import('@/pages/SubjectView').then(m => ({ default: m.SubjectView })));
const Settings = lazyPage(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const AIChat = lazyPage(() => import('@/pages/AIChat').then(m => ({ default: m.AIChat })));
const Docs = lazyPage(() => import('@/pages/Docs').then(m => ({ default: m.Docs })));
const MobileSubjects = lazyPage(() => import('@/pages/mobile/MobileSubjects').then(m => ({ default: m.MobileSubjects })));

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
          <PageLoadErrorBoundary>
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
          </PageLoadErrorBoundary>
        </HashRouter>
      </DialogProvider>
    </SortProvider>
  );
}

export default App;
