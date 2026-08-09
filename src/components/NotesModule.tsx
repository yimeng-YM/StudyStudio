import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Entity } from '@/db';
import {
  Plus, Trash, Edit, Save, ArrowUp, ArrowDown,
  ImageIcon, Undo, Redo, ArrowLeft,
  Bold, Italic, Strikethrough, List, ListOrdered, Heading1, Heading2, Heading3,
  Quote, Code, Link as LinkIcon, BookOpen,
  PanelLeftClose, PanelLeftOpen, Unlink
} from 'lucide-react';
import { useSorting, sortItems } from '@/hooks/useSorting';
import { useManualReorder } from '@/hooks/useManualReorder';
import { SortControls } from '@/components/ui/SortControls';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageRenderer, isHtmlContent, HtmlPreview } from './MessageRenderer';
import { cn, generateUUID, handleEditorPasteImage } from '@/lib/utils';
import { useDialog } from '@/components/ui/DialogProvider';
import { useHistory } from '@/hooks/useHistory';
import { useResizable } from '@/hooks/useResizable';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { useAIStore } from '@/store/useAIStore';
import { useNotesContext } from '@/hooks/useUIContext';
import {
  deleteEntityAndRelations,
  MINDMAP_NOTE_RELATION,
  unlinkNoteFromMindMaps,
} from '@/services/studyLinks';

interface NotesModuleProps {
  subjectId: string;
  initialNoteId?: string | null;
  initialSessionId?: string | null;
  onInitialNoteHandled?: (noteId: string) => void;
}

/** TOC 标题条目 */
interface HeadingItem {
  level: number;
  text: string;
}

/** 从 Markdown 文本中解析所有标题（# ~ ######） */
function parseHeadings(content: string): HeadingItem[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: HeadingItem[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
    });
  }
  return headings;
}

/**
 * 在容器 DOM 内查找文本匹配的标题元素，仅滚动容器自身（不影响外部布局）。
 * 使用 ResizeObserver 在 mermaid / katex 等异步渲染完成后自动修正位置。
 */
function scrollToHeadingInContainer(text: string, container: HTMLElement) {
  const findHeading = (): HTMLElement | null => {
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const h of headings) {
      if (h.textContent?.trim() === text) return h as HTMLElement;
    }
    for (const h of headings) {
      if (h.textContent?.trim().includes(text)) return h as HTMLElement;
    }
    return null;
  };

  /**
   * 仅滚动容器自身，不影响窗口或任何祖先元素。
   * 通过计算目标元素相对容器的偏移量来设置 scrollTop。
   */
  const scrollContainerTo = (smooth: boolean) => {
    const el = findHeading();
    if (!el) return false;
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = el.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop;
    container.scrollTo({ top: Math.max(0, offset - 8), behavior: smooth ? 'smooth' : 'auto' });
    return true;
  };

  if (!scrollContainerTo(true)) return;

  // 监听容器尺寸变化（mermaid / katex 渲染会改变布局），修正滚动位置
  let retries = 0;
  const maxRetries = 5;
  const observer = new ResizeObserver(() => {
    if (retries < maxRetries) {
      retries++;
      scrollContainerTo(false); // 后续修正使用 instant 避免视觉抖动
    } else {
      observer.disconnect();
    }
  });
  observer.observe(container);
  // 4 秒后无论如何断开
  setTimeout(() => observer.disconnect(), 4000);
}

/** ─── 目录组件 ─── */
function NotesTOC({
  content,
  onBack,
  onHeadingClick,
  onCollapse,
}: {
  content: string;
  onBack: () => void;
  onHeadingClick: (heading: HeadingItem) => void;
  onCollapse: () => void;
}) {
  const headings = useMemo(() => parseHeadings(content), [content]);

  return (
    <div className="md:border-r md:border-zinc-200 md:dark:border-zinc-800 md:pr-4 flex flex-col w-full h-full">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
          title="返回列表"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="font-medium text-sm text-zinc-600 dark:text-zinc-400">目录</span>
        <button
          onClick={onCollapse}
          className="ml-auto p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          title="收起目录"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {headings.length === 0 ? (
          <div className="text-zinc-400 text-sm text-center py-8">
            <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
            暂无标题
          </div>
        ) : (
          <div className="space-y-0.5">
            {headings.map((h, i) => (
              <button
                key={i}
                onClick={() => onHeadingClick(h)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors truncate block"
                style={{ paddingLeft: `${8 + (h.level - 1) * 14}px` }}
              >
                <span className="text-zinc-400 mr-1.5 text-xs font-mono select-none">
                  {'#'.repeat(h.level)}
                </span>
                <span className="text-zinc-700 dark:text-zinc-300">{h.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function NotesModule({
  subjectId,
  initialNoteId,
  initialSessionId,
  onInitialNoteHandled,
}: NotesModuleProps) {
  const { sortMode, sortDirection } = useSorting();

  const setFloatingWindowOpen = useAIStore(s => s.setFloatingWindowOpen);
  const setGlobalSessionId = useAIStore(s => s.setGlobalSessionId);
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId]);

  useEffect(() => {
    if (initialSessionId) {
      setGlobalSessionId(initialSessionId);
      setFloatingWindowOpen(true);
    }
  }, [initialSessionId, setFloatingWindowOpen, setGlobalSessionId]);

  const notes = useLiveQuery(async () => {
    const allNotes = await db.entities.where({ subjectId, type: 'note' }).toArray();
    return sortItems(allNotes, sortMode, sortDirection);
  }, [subjectId, sortMode, sortDirection]);

  const [selectedNote, setSelectedNote] = useState<Entity | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'toc' | 'detail'>('list');
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const handledInitialNoteIdRef = useRef<string | null>(null);
  // 目录侧栏是否完全收起（仅桌面端、查看笔记时生效）
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const {
    state: editContent,
    set: setEditContent,
    undo: undoEdit,
    redo: redoEdit,
    canUndo,
    canRedo,
    reset: resetEditContent
  } = useHistory('');

  const [editTitle, setEditTitle] = useState('');
  const { showAlert, showConfirm } = useDialog();
  const mindMapLinks = useLiveQuery(async () => {
    if (!selectedNote?.id) return [];
    const relations = await db.relations.where('targetId').equals(selectedNote.id).toArray();
    return relations.filter(relation => relation.type === MINDMAP_NOTE_RELATION);
  }, [selectedNote?.id], []);
  const { width: sidebarWidth, startResizing, isResizing } = useResizable({
    initialWidth: 320,
    minWidth: 200,
    maxWidth: 500,
    key: 'notesSidebarWidth',
    direction: 'right'
  });

  useEffect(() => {
    if (!initialNoteId) {
      handledInitialNoteIdRef.current = null;
      return;
    }
    if (!notes || handledInitialNoteIdRef.current === initialNoteId) return;

    const target = notes.find(note => note.id === initialNoteId);
    if (!target) return;

    handledInitialNoteIdRef.current = initialNoteId;
    setSelectedNote(target);
    resetEditContent(target.content);
    setEditTitle(target.title);
    setIsEditing(false);
    setViewMode('toc');
    setSidebarCollapsed(false);
    if (!initialSessionId && target.chatSessionId) {
      setGlobalSessionId(target.chatSessionId);
    }
    onInitialNoteHandled?.(target.id);
  }, [initialNoteId, notes, resetEditContent, initialSessionId, setGlobalSessionId, onInitialNoteHandled]);

  useEffect(() => {
    if (!notes || !selectedNote || isEditing) return;

    const current = notes.find(note => note.id === selectedNote.id);
    if (current && current.updatedAt > selectedNote.updatedAt) {
      setSelectedNote(current);
      resetEditContent(current.content);
      setEditTitle(current.title);
    }
  }, [notes, selectedNote, isEditing, resetEditContent]);

  const createNote = async () => {
    const id = generateUUID();
    const now = Date.now();
    const newNote = {
      id, subjectId, type: 'note' as const,
      title: '无标题笔记',
      content: '# 新建笔记\n\n开始写作...',
      createdAt: now, updatedAt: now, lastAccessed: now, order: now
    };
    await db.entities.add(newNote);
    setSelectedNote(newNote);
    resetEditContent(newNote.content);
    setEditTitle(newNote.title);
    setIsEditing(true);
    setViewMode('toc');
    setSidebarCollapsed(false);
  };

  const saveNote = async () => {
    if (!selectedNote) return;
    await db.entities.update(selectedNote.id, {
      title: editTitle,
      content: editContent,
      updatedAt: Date.now()
    });
    const updated = await db.entities.get(selectedNote.id);
    setSelectedNote(updated || null);
    setIsEditing(false);
  };

  const deleteNote = async (id: string) => {
    const confirmed = await showConfirm("确认删除此笔记？", { title: "删除笔记" });
    if (confirmed) {
      await deleteEntityAndRelations(id);
      if (selectedNote?.id === id) {
        setSelectedNote(null);
        setIsEditing(false);
        resetEditContent('');
        setEditTitle('');
        setViewMode('list');
        setSidebarCollapsed(false);
      }
    }
  };

  const unlinkSelectedNoteFromMindMaps = async () => {
    if (!selectedNote || mindMapLinks.length === 0) return;
    const linkCount = mindMapLinks.length;
    const confirmed = await showConfirm(
      linkCount === 1
        ? '解除这篇笔记与思维导图节点的关联？笔记内容会保留。'
        : `这篇笔记关联了 ${linkCount} 个思维导图节点，确定全部解除？笔记内容会保留。`,
      { title: '解除导图关联' },
    );
    if (!confirmed) return;

    try {
      const removedCount = await unlinkNoteFromMindMaps(selectedNote.id);
      await showAlert(
        removedCount > 0 ? `已解除 ${removedCount} 个导图关联` : '这篇笔记已经没有导图关联',
        { title: '解绑完成' },
      );
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : '解除导图关联失败', { title: '无法解绑' });
    }
  };

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const insertMarkdown = (prefix: string, suffix: string = '', blockMode: boolean = false) => {
    if (!textAreaRef.current) return;
    const start = textAreaRef.current.selectionStart;
    const end = textAreaRef.current.selectionEnd;
    const text = editContent;
    const before = text.substring(0, start);
    const selection = text.substring(start, end);
    const after = text.substring(end);
    const scrollTop = textAreaRef.current.scrollTop;
    let actualPrefix = prefix;
    let actualSuffix = suffix;
    if (blockMode) {
      if (start > 0 && text[start - 1] !== '\n') actualPrefix = '\n' + actualPrefix;
      if (end < text.length && text[end] !== '\n') actualSuffix = actualSuffix + '\n';
    }
    const newContent = before + actualPrefix + selection + actualSuffix + after;
    setEditContent(newContent);
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
        const newCursorPos = selection.length === 0 && suffix.length > 0
          ? start + actualPrefix.length
          : start + actualPrefix.length + selection.length + actualSuffix.length;
        textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textAreaRef.current.scrollTop = scrollTop;
      }
    }, 0);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        let id: string;
        try { id = generateUUID(); } catch (e) {
          id = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }
        try {
          await db.attachments.add({ id, data: base64, mimeType: file.type, fileName: file.name, createdAt: Date.now() });
        } catch (dbError) {
          alert("图片保存失败，请重试");
          return;
        }
        if (textAreaRef.current) {
          const start = textAreaRef.current.selectionStart;
          const end = textAreaRef.current.selectionEnd;
          const scrollTop = textAreaRef.current.scrollTop;
          const text = editContent;
          const before = text.substring(0, start);
          const after = text.substring(end);
          const imageMarkdown = `\n![Image](attachment:${id})\n`;
          const newContent = before + imageMarkdown + after;
          setEditContent(newContent);
          setTimeout(() => {
            if (textAreaRef.current) {
              textAreaRef.current.focus();
              const newCursorPos = start + imageMarkdown.length;
              textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
              textAreaRef.current.scrollTop = scrollTop;
            }
          }, 0);
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  useNotesContext(subjectId, subject?.name, selectedNote?.id, selectedNote?.title, isEditing);

  const handleSelectNote = (note: Entity) => {
    setSelectedNote(note);
    setEditContent(note.content);
    setEditTitle(note.title);
    setIsEditing(false);
    setViewMode('toc');
    setScrollTarget(null);
    setSidebarCollapsed(false);
    db.entities.update(note.id, { lastAccessed: Date.now() });
  };

  const handleBackToList = () => {
    setSelectedNote(null);
    setIsEditing(false);
    setViewMode('list');
    setScrollTarget(null);
    setSidebarCollapsed(false);
  };

  const handleDetailBack = () => {
    setViewMode('toc');
    setScrollTarget(null);
  };

  const handleHeadingClick = useCallback((heading: HeadingItem) => {
    if (window.innerWidth >= 768) {
      setScrollTarget(heading.text);
      setTimeout(() => setScrollTarget(null), 100);
    } else {
      setViewMode('detail');
      setTimeout(() => setScrollTarget(heading.text), 50);
    }
  }, []);

  const handleScrollComplete = useCallback(() => {
    setScrollTarget(null);
  }, []);

  // ── 桌面端布局 ──
  const desktopLayout = (
    <div className="hidden md:flex h-full w-full">
      {/* 左侧面板：列表 ⇄ 目录（查看笔记时可完全收起，带宽度过渡动画） */}
      <AnimatePresence initial={false}>
        {(!sidebarCollapsed || !selectedNote) && (
          <motion.div
            key="notes-sidebar"
            initial={{ width: 0, marginRight: 0, opacity: 0 }}
            animate={{ width: sidebarWidth, marginRight: 16, opacity: 1 }}
            exit={{ width: 0, marginRight: 0, opacity: 0 }}
            transition={{ duration: isResizing ? 0 : 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="relative shrink-0 h-full"
          >
            <div className="absolute inset-0 overflow-hidden">
              <div style={{ width: sidebarWidth }} className="h-full">
                <AnimatePresence mode="wait">
                  {!selectedNote ? (
                    <motion.div
                      key="notes-list"
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.2 }}
                      className="h-full"
                    >
                      <NotesList
                        notes={notes}
                        selectedNote={selectedNote}
                        onSelectNote={handleSelectNote}
                        createNote={createNote}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="notes-toc"
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.2 }}
                      className="h-full"
                    >
                      <NotesTOC
                        content={selectedNote.content}
                        onBack={handleBackToList}
                        onHeadingClick={handleHeadingClick}
                        onCollapse={() => setSidebarCollapsed(true)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <ResizeHandle onMouseDown={startResizing} className="absolute right-0 top-0 bottom-0 translate-x-1/2" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 右侧面板：内容 */}
      <AnimatePresence mode="wait">
        {!selectedNote ? (
          <motion.div
            key="placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 min-w-0"
          >
            <NoteDetailPlaceholder />
          </motion.div>
        ) : (
          <motion.div
            key={selectedNote.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.25 }}
            className="flex-1 min-w-0"
          >
            <NoteDetail
              selectedNote={selectedNote}
              isEditing={isEditing}
              editTitle={editTitle}
              editContent={editContent}
              setEditTitle={setEditTitle}
              setEditContent={setEditContent}
              setIsEditing={setIsEditing}
              saveNote={saveNote}
              deleteNote={deleteNote}
              mindMapLinkCount={mindMapLinks.length}
              unlinkFromMindMaps={unlinkSelectedNoteFromMindMaps}
              undoEdit={undoEdit}
              redoEdit={redoEdit}
              canUndo={canUndo}
              canRedo={canRedo}
              insertMarkdown={insertMarkdown}
              handleImageUpload={handleImageUpload}
              textAreaRef={textAreaRef}
              fileInputRef={fileInputRef}
              scrollTarget={scrollTarget}
              onScrollComplete={handleScrollComplete}
              sidebarCollapsed={sidebarCollapsed}
              onExpandSidebar={() => setSidebarCollapsed(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ── 移动端布局 ──
  const mobileLayout = (
    <div className="md:hidden flex flex-col h-full w-full">
      <AnimatePresence mode="wait">
        {viewMode === 'list' && (
          <motion.div
            key="m-list"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-y-auto px-3 pt-3"
          >
            <NotesList
              notes={notes}
              selectedNote={selectedNote}
              onSelectNote={handleSelectNote}
              createNote={createNote}
            />
          </motion.div>
        )}

        {viewMode === 'toc' && (
          <motion.div
            key="m-toc"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
              <button onClick={handleBackToList} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
                <ArrowLeft size={20} />
              </button>
              <span className="font-medium text-sm truncate">{selectedNote?.title}</span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pt-3">
              <MobileTOC
                content={selectedNote?.content || ''}
                onHeadingClick={handleHeadingClick}
              />
            </div>
          </motion.div>
        )}

        {viewMode === 'detail' && (
          <motion.div
            key="m-detail"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full"
          >
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
              <button onClick={handleDetailBack} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg shrink-0">
                <ArrowLeft size={20} />
              </button>
              {isEditing ? (
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="flex-1 font-medium text-sm bg-transparent border-b border-blue-500 focus:outline-none text-zinc-800 dark:text-zinc-200 min-w-0 px-1" />
              ) : (
                <span className="flex-1 font-medium text-sm truncate text-zinc-800 dark:text-zinc-200 px-1">{selectedNote?.title}</span>
              )}
              {isEditing ? (
                <button onClick={saveNote} className="p-1.5 text-green-600 hover:text-green-700 bg-green-50 dark:bg-green-900/20 rounded-lg shrink-0" title="保存"><Save size={18} /></button>
              ) : (
                <button onClick={() => setIsEditing(true)} className="p-1.5 text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20 rounded-lg shrink-0" title="编辑"><Edit size={18} /></button>
              )}
              {mindMapLinks.length > 0 && (
                <button
                  onClick={unlinkSelectedNoteFromMindMaps}
                  className="p-1.5 text-amber-600 hover:text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg shrink-0"
                  title={`解除 ${mindMapLinks.length} 个导图关联`}
                  aria-label={`解除 ${mindMapLinks.length} 个导图关联`}
                >
                  <Unlink size={18} />
                </button>
              )}
              <button onClick={() => { if (selectedNote) deleteNote(selectedNote.id); }} className="p-1.5 text-red-600 hover:text-red-700 bg-red-50 dark:bg-red-900/20 rounded-lg shrink-0" title="删除"><Trash size={18} /></button>
            </div>
            <div className="flex-1 min-h-0">
              <NoteDetail
                selectedNote={selectedNote}
                isEditing={isEditing}
                editTitle={editTitle}
                editContent={editContent}
                setEditTitle={setEditTitle}
                setEditContent={setEditContent}
                setIsEditing={setIsEditing}
                saveNote={saveNote}
                deleteNote={deleteNote}
                mindMapLinkCount={mindMapLinks.length}
                unlinkFromMindMaps={unlinkSelectedNoteFromMindMaps}
                undoEdit={undoEdit}
                redoEdit={redoEdit}
                canUndo={canUndo}
                canRedo={canRedo}
                insertMarkdown={insertMarkdown}
                handleImageUpload={handleImageUpload}
                textAreaRef={textAreaRef}
                fileInputRef={fileInputRef}
                scrollTarget={scrollTarget}
                onScrollComplete={handleScrollComplete}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="flex h-full gap-4 relative">
      {desktopLayout}
      {mobileLayout}
    </div>
  );
}

/** 空状态占位 */
function NoteDetailPlaceholder() {
  return (
    <div className="h-full flex items-center justify-center text-zinc-400 bg-white/70 dark:bg-zinc-900/50 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800">
      选择一个笔记以查看或编辑，或者创建新笔记
    </div>
  );
}

/** ─── 移动端内联目录 ─── */
function MobileTOC({
  content,
  onHeadingClick,
}: {
  content: string;
  onHeadingClick: (heading: HeadingItem) => void;
}) {
  const headings = useMemo(() => parseHeadings(content), [content]);

  if (headings.length === 0) {
    return (
      <div className="text-zinc-400 text-sm text-center py-12">
        <BookOpen size={40} className="mx-auto mb-3 opacity-25" />
        暂无标题，点击下方可直接阅读全文
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {headings.map((h, i) => (
        <button
          key={i}
          onClick={() => onHeadingClick(h)}
          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors flex items-center gap-2 active:scale-[0.98]"
        >
          <span className="text-zinc-400 text-xs font-mono shrink-0">
            {'#'.repeat(h.level)}
          </span>
          <span className="text-zinc-700 dark:text-zinc-300 truncate">{h.text}</span>
        </button>
      ))}
    </div>
  );
}

/** ─── 笔记详情组件 ─── */
function NoteDetail({
  selectedNote, isEditing, editTitle, editContent, setEditTitle, setEditContent,
  setIsEditing, saveNote, deleteNote, undoEdit, redoEdit, canUndo, canRedo,
  mindMapLinkCount, unlinkFromMindMaps,
  insertMarkdown, handleImageUpload, textAreaRef, fileInputRef,
  scrollTarget, onScrollComplete, sidebarCollapsed, onExpandSidebar,
}: any) {
  const readingRef = useRef<HTMLDivElement>(null);

  // 处理目录滚动（含 mermaid/katex 渲染修正）
  useEffect(() => {
    if (scrollTarget && readingRef.current && !isEditing) {
      const raf = requestAnimationFrame(() => {
        if (readingRef.current) {
          scrollToHeadingInContainer(scrollTarget, readingRef.current);
        }
        // 延迟清除，确保 ResizeObserver 有机会修正
        setTimeout(() => onScrollComplete?.(), 4000);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [scrollTarget, isEditing, onScrollComplete]);

  if (!selectedNote) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 bg-white/70 dark:bg-zinc-900/50 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800">
        选择一个笔记以查看或编辑，或者创建新笔记
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white/70 dark:bg-zinc-900/50 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 p-3 md:p-4 min-h-0">
      <div className="hidden md:flex justify-between items-center mb-4 border-b dark:border-slate-800 pb-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {sidebarCollapsed && (
            <button
              onClick={onExpandSidebar}
              className="shrink-0 p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
              title="展开目录"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
          {isEditing ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="text-lg md:text-xl font-bold bg-transparent border-b focus:outline-none text-slate-800 dark:text-slate-200 flex-1 min-w-0"
            />
          ) : (
            <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-200 truncate min-w-0">{selectedNote.title}</h2>
          )}
        </div>
        <div className="flex gap-1 md:gap-2 shrink-0 ml-2">
          {isEditing ? (
            <>
              <button onClick={undoEdit} disabled={!canUndo} className="p-1.5 md:p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-600 dark:text-slate-400" title="撤销"><Undo size={18} /></button>
              <button onClick={redoEdit} disabled={!canRedo} className="p-1.5 md:p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-600 dark:text-slate-400" title="重做"><Redo size={18} /></button>
              <button onClick={saveNote} className="text-green-600 hover:text-green-700 bg-green-50 dark:bg-green-900/20 p-1.5 md:p-2 rounded"><Save size={18} /></button>
              <button onClick={() => fileInputRef.current?.click()} className="text-slate-600 hover:text-slate-700 bg-slate-50 dark:bg-slate-800 p-1.5 md:p-2 rounded" title="插入图片"><ImageIcon size={18} /></button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} className="text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20 p-1.5 md:p-2 rounded"><Edit size={18} /></button>
          )}
          {mindMapLinkCount > 0 && (
            <button
              onClick={unlinkFromMindMaps}
              className="text-amber-600 hover:text-amber-700 bg-amber-50 dark:bg-amber-900/20 p-1.5 md:p-2 rounded"
              title={`解除 ${mindMapLinkCount} 个导图关联`}
              aria-label={`解除 ${mindMapLinkCount} 个导图关联`}
            >
              <Unlink size={18} />
            </button>
          )}
          <button onClick={() => deleteNote(selectedNote.id)} className="text-red-600 hover:text-red-700 bg-red-50 dark:bg-red-900/20 p-1.5 md:p-2 rounded"><Trash size={18} /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        {isEditing ? (
          <div className="flex-1 min-h-0 flex flex-col border border-zinc-200 dark:border-zinc-700 rounded">
            <div className="flex flex-wrap items-center gap-0.5 p-1.5 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 overflow-x-auto">
              <button onClick={undoEdit} disabled={!canUndo} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0 md:hidden disabled:opacity-30" title="撤销"><Undo size={14} /></button>
              <button onClick={redoEdit} disabled={!canRedo} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0 md:hidden disabled:opacity-30" title="重做"><Redo size={14} /></button>
              <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0 md:hidden" title="插入图片"><ImageIcon size={14} /></button>
              <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-0.5 shrink-0 md:hidden" />
              <button onClick={() => insertMarkdown('**', '**')} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="加粗"><Bold size={14} /></button>
              <button onClick={() => insertMarkdown('*', '*')} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="斜体"><Italic size={14} /></button>
              <button onClick={() => insertMarkdown('~~', '~~')} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="删除线"><Strikethrough size={14} /></button>
              <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-0.5 shrink-0" />
              <button onClick={() => insertMarkdown('# ', '', true)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="一级标题"><Heading1 size={14} /></button>
              <button onClick={() => insertMarkdown('## ', '', true)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="二级标题"><Heading2 size={14} /></button>
              <button onClick={() => insertMarkdown('### ', '', true)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="三级标题"><Heading3 size={14} /></button>
              <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-0.5 shrink-0" />
              <button onClick={() => insertMarkdown('- ', '', true)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="无序列表"><List size={14} /></button>
              <button onClick={() => insertMarkdown('1. ', '', true)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="有序列表"><ListOrdered size={14} /></button>
              <button onClick={() => insertMarkdown('> ', '', true)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="引用"><Quote size={14} /></button>
              <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-0.5 shrink-0" />
              <button onClick={() => insertMarkdown('```\n', '\n```', true)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="代码块"><Code size={14} /></button>
              <button onClick={() => insertMarkdown('[', '](url)')} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 shrink-0" title="链接"><LinkIcon size={14} /></button>
            </div>
            <textarea
              ref={textAreaRef}
              className="w-full flex-1 resize-none focus:outline-none bg-transparent text-zinc-800 dark:text-zinc-200 font-mono p-3"
              style={{ fontSize: 'var(--app-font-size, 14px)' }}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onPaste={e => handleEditorPasteImage(e, textAreaRef.current, editContent, setEditContent)}
              placeholder="开始写作..."
            />
          </div>
        ) : (
          isHtmlContent(selectedNote.content) ? (
            <HtmlPreview content={selectedNote.content} mode="view" autoHeight={false} className="flex-1 min-h-0" />
          ) : (
            <div
              ref={readingRef}
              className="prose dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 overflow-auto flex-1 min-h-0 min-w-0"
              style={{ fontSize: 'var(--app-font-size, 14px)', overscrollBehavior: 'contain', wordBreak: 'break-word' }}
            >
              <MessageRenderer content={selectedNote.content} />
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** ─── 笔记列表组件 ─── */
function NotesList({ notes, selectedNote, onSelectNote, createNote }: { notes: any[] | undefined; selectedNote: any; onSelectNote: (note: any) => void; createNote: () => void }) {
  const { sortMode, sortDirection, setSortMode, toggleDirection } = useSorting();
  const { moveItem } = useManualReorder(notes, db.entities);

  return (
    <div className="md:border-r md:border-zinc-200 md:dark:border-zinc-800 md:pr-4 flex flex-col relative w-full h-full">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-2">
          <button onClick={createNote} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 transition-colors">
            <Plus size={16} /> 新建笔记
          </button>
        </div>
        <SortControls
          sortMode={sortMode}
          sortDirection={sortDirection}
          onModeChange={setSortMode}
          onDirectionToggle={toggleDirection}
          variant="filled"
        />
      </div>
      <div className="space-y-2 overflow-y-auto flex-1">
        {notes?.map((note: any, idx: number) => (
          <div
            key={note.id}
            onClick={() => onSelectNote(note)}
            className={cn(
              "p-3 rounded cursor-pointer transition-all group relative animate-in slide-in-from-left duration-300",
              selectedNote?.id === note.id ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'
            )}
            style={{ animationDelay: `${idx * 30}ms`, contentVisibility: 'auto', containIntrinsicSize: 'auto 60px' }}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate text-slate-800 dark:text-slate-200">{note.title}</div>
                <div className="text-xs text-slate-500">{new Date(note.updatedAt).toLocaleDateString()}</div>
              </div>
              {sortMode === 'manual' && (
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem(note.id, 'up'); }} disabled={idx === 0} className="p-0.5 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 disabled:opacity-0"><ArrowUp size={12} /></button>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveItem(note.id, 'down'); }} disabled={idx === (notes?.length || 0) - 1} className="p-0.5 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 disabled:opacity-0"><ArrowDown size={12} /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
