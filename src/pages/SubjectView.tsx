import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { cn } from '@/lib/utils';
import { Network, FileText, CheckSquare, Library, BookOpen, Trash2 } from 'lucide-react';
import { MindMapEditor } from '@/components/MindMapEditor';
import { ICON_MAP, ICON_OPTIONS } from '@/lib/icons';
import { NotesModule } from '@/components/NotesModule';
import { TasksModule } from '@/components/TasksModule';
import { QuizModule } from '@/components/QuizModule';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/Modal';
import { useDialog } from '@/components/ui/DialogProvider';

export function SubjectView() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { showPrompt } = useDialog();
  const subject = useLiveQuery(() => db.subjects.get(id || ''), [id]);

  const [activeTab, setActiveTab] = useState<'mindmap' | 'notes' | 'tasks' | 'quiz'>('mindmap');
  const [targetNoteId, setTargetNoteId] = useState<string | null>(null);
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', icon: '' });

  useEffect(() => {
    if (location.state) {
      if (location.state.view) {
        setActiveTab(location.state.view);
      }
      if (location.state.initialNoteId) {
        setTargetNoteId(location.state.initialNoteId);
      }
      if (location.state.openChatSessionId) {
        setTargetSessionId(location.state.openChatSessionId);
      }
    }
  }, [location.state]);

  const handleUpdateSubject = async () => {
    if (editForm.name.trim()) {
      await db.subjects.update(id!, {
        name: editForm.name,
        icon: editForm.icon
      });
      setIsEditModalOpen(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    const { deleteSubjectWithConfirm } = await import('@/lib/subjectUtils');
    const success = await deleteSubjectWithConfirm(e, id!, showPrompt);
    if (success) {
      setIsEditModalOpen(false);
      navigate('/');
    }
  };

  const handleNavigate = (tab: 'mindmap' | 'notes' | 'tasks', params?: { noteId?: string }) => {
    setActiveTab(tab);
    if (params?.noteId) {
      setTargetNoteId(params.noteId);
    }
  };

  if (!subject) return <div className="p-8">加载中...</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-8 py-4 bg-white dark:bg-black border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky top-0 z-10">
        <div
          className="flex items-center gap-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 px-3 py-1.5 rounded-xl transition-colors group"
          onClick={() => {
            setEditForm({ name: subject.name, icon: subject.icon || 'BookOpen' });
            setIsEditModalOpen(true);
          }}
          title="编辑学科"
        >
          {(() => {
            const Icon = ICON_MAP[subject.icon || 'BookOpen'] || BookOpen;
            return <Icon size={28} className="text-primary group-hover:scale-110 transition-transform" />;
          })()}
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {subject.name}
          </h1>
        </div>

        <div className="flex space-x-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('mindmap')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors",
              activeTab === 'mindmap' ? "bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <Network size={16} />
            思维导图
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors",
              activeTab === 'notes' ? "bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <FileText size={16} />
            详细知识
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors",
              activeTab === 'quiz' ? "bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <Library size={16} />
            题库
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors",
              activeTab === 'tasks' ? "bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <CheckSquare size={16} />
            任务列表
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-6 bg-zinc-50/50 dark:bg-black relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full w-full"
          >
            {activeTab === 'mindmap' && (
              <MindMapEditor
                subjectId={id || ''}
                onNavigate={handleNavigate}
                initialSessionId={targetSessionId}
              />
            )}
            {activeTab === 'notes' && <NotesModule subjectId={id || ''} initialNoteId={targetNoteId} initialSessionId={targetSessionId} />}
            {activeTab === 'quiz' && <QuizModule subjectId={id || ''} />}
            {activeTab === 'tasks' && <TasksModule subjectId={id || ''} initialSessionId={targetSessionId} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="编辑学科"
        footer={
          <div className="flex justify-between w-full">
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors"
            >
              <Trash2 size={18} />
              删除学科
            </button>
            <div className="flex gap-2">
              <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors">取消</button>
              <button onClick={handleUpdateSubject} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity">保存</button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">学科名称</label>
            <input
              className="w-full border rounded p-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="输入学科名称..."
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleUpdateSubject()}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">选择图标</label>
            <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto p-2 border rounded dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
              {ICON_OPTIONS.map(iconName => {
                const Icon = ICON_MAP[iconName];
                return (
                  <button
                    key={iconName}
                    onClick={() => setEditForm({ ...editForm, icon: iconName })}
                    className={cn(
                      "p-2 rounded-lg flex items-center justify-center transition-all",
                      editForm.icon === iconName
                        ? "bg-primary text-primary-foreground scale-110 shadow-sm"
                        : "text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    )}
                    title={iconName}
                  >
                    <Icon size={20} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
