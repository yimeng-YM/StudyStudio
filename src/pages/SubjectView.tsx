import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { cn } from '@/lib/utils';
import { Network, FileText, CheckSquare } from 'lucide-react';
import { MindMapEditor } from '@/components/MindMapEditor';
import { NotesModule } from '@/components/NotesModule';
import { TasksModule } from '@/components/TasksModule';
import { motion, AnimatePresence } from 'framer-motion';

export function SubjectView() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const subject = useLiveQuery(() => db.subjects.get(id || ''), [id]);

  const [activeTab, setActiveTab] = useState<'mindmap' | 'notes' | 'tasks'>('mindmap');
  const [targetNoteId, setTargetNoteId] = useState<string | null>(null);
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');

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

  const handleNameUpdate = async () => {
    if (editedName.trim() && editedName !== subject?.name) {
      await db.subjects.update(id!, { name: editedName });
    }
    setIsEditing(false);
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
        {isEditing ? (
          <input
            autoFocus
            className="text-2xl font-bold text-zinc-800 dark:text-zinc-100 bg-transparent border-b-2 border-primary outline-none"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameUpdate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameUpdate();
              if (e.key === 'Escape') {
                setIsEditing(false);
                setEditedName(subject.name);
              }
            }}
          />
        ) : (
          <h1
            onClick={() => {
              setIsEditing(true);
              setEditedName(subject.name);
            }}
            className="text-2xl font-bold text-slate-800 dark:text-slate-100 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 px-2 rounded -ml-2 transition-colors"
            title="点击修改名称"
          >
            {subject.name}
          </h1>
        )}

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
            {activeTab === 'tasks' && <TasksModule subjectId={id || ''} initialSessionId={targetSessionId} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
