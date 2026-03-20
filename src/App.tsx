import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { SubjectView } from '@/pages/SubjectView';
import { Settings } from '@/pages/Settings';
import { AIChat } from '@/pages/AIChat';
import { DialogProvider } from '@/components/ui/DialogProvider';
import { useStudyLogger } from '@/hooks/useStudyLogger';

function App() {
  useStudyLogger();

  return (
    <DialogProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="subject/:id" element={<SubjectView />} />
            <Route path="settings" element={<Settings />} />
            <Route path="ai-chat" element={<AIChat />} />
          </Route>
        </Routes>
      </HashRouter>
    </DialogProvider>
  );
}

export default App;
