import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { SubjectView } from '@/pages/SubjectView';
import { Settings } from '@/pages/Settings';
import { AIChat } from '@/pages/AIChat';
import { Docs } from '@/pages/Docs';
import { MobileSubjects } from '@/pages/mobile/MobileSubjects';
import { DialogProvider } from '@/components/ui/DialogProvider';
import { useStudyLogger } from '@/hooks/useStudyLogger';

/**
 * 应用根组件
 * 
 * 核心逻辑：
 * 1. 路由体系结构：使用 React Router 的 HashRouter 实现单页应用路由，通过 Layout 组件进行页面嵌套布局。
 * 2. 全局 Context Providers 层级组织：
 *    - DialogProvider: 提供全局模态框和通知服务，位于最外层以确保其覆盖所有 UI。
 *    - HashRouter: 路由上下文，负责解析 URL 并分发给对应的页面组件。
 *    - useStudyLogger: 全局钩子，用于初始化和监听用户学习行为日志。
 * 
 * @returns {JSX.Element} App 根组件
 */
function App() {
  useStudyLogger();

  return (
    <DialogProvider>
      <HashRouter>
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
      </HashRouter>
    </DialogProvider>
  );
}

export default App;
