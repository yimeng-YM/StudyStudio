import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Entity } from '@/db';
import {
  Plus, Trash, Edit, Save, ArrowUp, ArrowDown, SortAsc, Clock, GripVertical,
  ImageIcon, Undo, Redo, ArrowLeft,
  Bold, Italic, Strikethrough, List, ListOrdered, Heading1, Heading2, Heading3,
  Quote, Code, Link as LinkIcon
} from 'lucide-react';
import { MessageRenderer } from './MessageRenderer';
import { cn, generateUUID } from '@/lib/utils';
import { useDialog } from '@/components/ui/DialogProvider';
import { useHistory } from '@/hooks/useHistory';
import { useAIStore } from '@/store/useAIStore';
import { useNotesContext } from '@/hooks/useUIContext';

/**
 * 笔记模块组件属性
 * @property {string} subjectId - 关联的学科ID
 * @property {string | null} [initialNoteId] - 初始选中的笔记ID
 * @property {string | null} [initialSessionId] - 初始AI会话ID
 */
interface NotesModuleProps {
  subjectId: string;
  initialNoteId?: string | null;
  initialSessionId?: string | null;
}

export function NotesModule({ subjectId, initialNoteId, initialSessionId }: NotesModuleProps) {
  const [sortMode, setSortMode] = useState<'name' | 'lastAccessed' | 'manual'>(() =>
    (localStorage.getItem('notesSortMode') as any) || 'lastAccessed');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() =>
    (localStorage.getItem('notesSortDirection') as any) || 'desc');

  const { setFloatingWindowOpen, setGlobalSessionId } = useAIStore();

  /** 获取当前学科信息 */
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId]);

  useEffect(() => {
    if (initialSessionId) {
      setGlobalSessionId(initialSessionId);
      setFloatingWindowOpen(true);
    }
  }, [initialSessionId, setFloatingWindowOpen, setGlobalSessionId]);

  useEffect(() => {
    localStorage.setItem('notesSortMode', sortMode);
    localStorage.setItem('notesSortDirection', sortDirection);
  }, [sortMode, sortDirection]);

  const notes = useLiveQuery(async () => {
    const allNotes = await db.entities.where({ subjectId, type: 'note' }).toArray();

    return allNotes.sort((a, b) => {
      let valA: any, valB: any;
      if (sortMode === 'name') {
        valA = a.title;
        valB = b.title;
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortMode === 'lastAccessed') {
        valA = a.lastAccessed || 0;
        valB = b.lastAccessed || 0;
      } else if (sortMode === 'manual') {
        valA = a.order || 0;
        valB = b.order || 0;
      } else {
        valA = a.createdAt;
        valB = b.createdAt;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [subjectId, sortMode, sortDirection]);

  /** @type {[Entity | null, Function]} 当前选中的笔记实体 */
  const [selectedNote, setSelectedNote] = useState<Entity | null>(null);
  /** @type {[boolean, Function]} 是否处于编辑模式 */
  const [isEditing, setIsEditing] = useState(false);

  /** 笔记内容撤销/重做Hook状态管理 */
  const {
    state: editContent,
    set: setEditContent,
    undo: undoEdit,
    redo: redoEdit,
    canUndo,
    canRedo,
    reset: resetEditContent
  } = useHistory('');

  /** @type {[string, Function]} 当前编辑的笔记标题 */
  const [editTitle, setEditTitle] = useState('');
  const { showConfirm } = useDialog();

  // Clear chat session if no initial note/session
  useEffect(() => {
    if (!initialNoteId && !initialSessionId) {
      // Don't clear globalSessionId automatically on tab switch
    }
  }, [initialNoteId, initialSessionId]);

  /**
   * 监听笔记列表或初始参数变化，更新选中笔记状态
   * 优先级1: 若提供了 initialNoteId 且有效，则切换至该笔记
   * 优先级2: 自动同步数据库中已更新的当前选中笔记内容（非编辑状态下）
   */
  useEffect(() => {
    if (notes) {
      if (initialNoteId) {
        const target = notes.find(n => n.id === initialNoteId);
        if (target && target.id !== selectedNote?.id) {
          setSelectedNote(target);
          resetEditContent(target.content);
          setEditTitle(target.title);
          setIsEditing(false);
          if (!initialSessionId && target.chatSessionId) {
            setGlobalSessionId(target.chatSessionId);
          }
          return;
        }
      }

      if (selectedNote) {
        const current = notes.find(n => n.id === selectedNote.id);
        if (current && current.updatedAt > selectedNote.updatedAt && !isEditing) {
          setSelectedNote(current);
          resetEditContent(current.content);
          setEditTitle(current.title);
        }
      }
    }
  }, [initialNoteId, notes, selectedNote?.id, selectedNote?.updatedAt, isEditing, resetEditContent, initialSessionId, setGlobalSessionId]);

  /**
   * 创建新笔记记录并进入编辑模式
   */
  const createNote = async () => {
    const id = generateUUID();
    const now = Date.now();
    const newNote = {
      id,
      subjectId,
      type: 'note',
      title: '无标题笔记',
      content: '# 新建笔记\n\n开始写作...',
      createdAt: now,
      updatedAt: now,
      lastAccessed: now,
      order: now
    } as Entity;
    await db.entities.add(newNote);
    setSelectedNote(newNote);
    resetEditContent(newNote.content);
    setEditTitle(newNote.title);
    setIsEditing(true);
  };

  /**
   * 移动笔记在列表中的排序位置（仅在 manual 模式下有效）
   * @param {React.MouseEvent} e - 鼠标事件
   * @param {string} id - 笔记ID
   * @param {'up' | 'down'} direction - 移动方向
   */
  const moveNote = async (e: React.MouseEvent, id: string, direction: 'up' | 'down') => {
    e.preventDefault();
    e.stopPropagation();
    if (!notes) return;

    const index = notes.findIndex(n => n.id === id);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= notes.length) return;

    const current = notes[index];
    const target = notes[targetIndex];

    await db.transaction('rw', db.entities, async () => {
      await db.entities.update(current.id, { order: target.order });
      await db.entities.update(target.id, { order: current.order });
    });
  };

  /**
   * 保存当前编辑的笔记内容和标题至数据库
   */
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

  /**
   * 删除指定的笔记记录
   * @param {string} id - 笔记ID
   */
  const deleteNote = async (id: string) => {
    const confirmed = await showConfirm("确认删除此笔记？", { title: "删除笔记" });
    if (confirmed) {
      await db.entities.delete(id);
      if (selectedNote?.id === id) {
        setSelectedNote(null);
        setIsEditing(false);
        resetEditContent('');
        setEditTitle('');
      }
    }
  };

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * 往编辑器光标处插入 Markdown 语法片段
   * @param {string} prefix - 前缀字符
   * @param {string} [suffix=''] - 后缀字符
   * @param {boolean} [blockMode=false] - 是否为块级元素（需换行）
   */
  const insertMarkdown = (prefix: string, suffix: string = '', blockMode: boolean = false) => {
    if (!textAreaRef.current) return;

    const start = textAreaRef.current.selectionStart;
    const end = textAreaRef.current.selectionEnd;
    const text = editContent;
    const before = text.substring(0, start);
    const selection = text.substring(start, end);
    const after = text.substring(end);
    
    // 保存滚动位置
    const scrollTop = textAreaRef.current.scrollTop;

    let actualPrefix = prefix;
    let actualSuffix = suffix;

    if (blockMode) {
      if (start > 0 && text[start - 1] !== '\n') {
        actualPrefix = '\n' + actualPrefix;
      }
      if (end < text.length && text[end] !== '\n') {
        actualSuffix = actualSuffix + '\n';
      }
    }

    const newContent = before + actualPrefix + selection + actualSuffix + after;
    setEditContent(newContent);

    // Focus back and adjust cursor
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
        // If no text was selected, place cursor between prefix and suffix
        // If text was selected, place cursor at the end of the insertion
        const newCursorPos = selection.length === 0 && suffix.length > 0
          ? start + actualPrefix.length
          : start + actualPrefix.length + selection.length + actualSuffix.length;

        textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        // 恢复滚动位置
        textAreaRef.current.scrollTop = scrollTop;
      }
    }, 0);
  };

  /**
   * 处理本地图片上传并插入到笔记中
   * 转换图片为 Base64 格式并存入数据库 attachments 表
   * @param {React.ChangeEvent<HTMLInputElement>} e - 文件上传事件
   */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        let id: string;
        try {
          id = generateUUID();
        } catch (e) {
          console.error("Crypto UUID failed, using timestamp fallback", e);
          id = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }

        console.log("Saving attachment with ID:", id);
        try {
          await db.attachments.add({
            id,
            data: base64,
            mimeType: file.type,
            fileName: file.name,
            createdAt: Date.now()
          });
        } catch (dbError) {
          console.error("Failed to save attachment to DB:", dbError);
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

  // 使用新的 useNotesContext hook 来注册上下文
  useNotesContext(
    subjectId,
    subject?.name,
    selectedNote?.id,
    selectedNote?.title,
    isEditing
  );

  const handleSelectNote = (note: Entity) => {
    setSelectedNote(note);
    setEditContent(note.content);
    setEditTitle(note.title);
    setIsEditing(false);
    db.entities.update(note.id, { lastAccessed: Date.now() });
  };

  const handleBackToList = () => {
    setSelectedNote(null);
    setIsEditing(false);
  };

  return (
    <div className="flex h-full gap-4 relative pb-14 md:pb-0">
      {/* Desktop: two-column layout */}
      <div className="hidden md:flex h-full gap-4 w-full">
        <NotesList
          notes={notes}
          selectedNote={selectedNote}
          onSelectNote={handleSelectNote}
          createNote={createNote}
          moveNote={moveNote}
          sortMode={sortMode}
          setSortMode={setSortMode}
          sortDirection={sortDirection}
          setSortDirection={setSortDirection}
        />
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
          undoEdit={undoEdit}
          redoEdit={redoEdit}
          canUndo={canUndo}
          canRedo={canRedo}
          insertMarkdown={insertMarkdown}
          handleImageUpload={handleImageUpload}
          textAreaRef={textAreaRef}
          fileInputRef={fileInputRef}
        />
      </div>

      {/* Mobile: list-first-then-detail */}
      <div className="md:hidden flex flex-col h-full w-full">
        {!selectedNote ? (
          <div className="flex-1 overflow-y-auto px-3 pt-3">
            <NotesList
              notes={notes}
              selectedNote={selectedNote}
              onSelectNote={handleSelectNote}
              createNote={createNote}
              moveNote={moveNote}
              sortMode={sortMode}
              setSortMode={setSortMode}
              sortDirection={sortDirection}
              setSortDirection={setSortDirection}
            />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
              <button onClick={handleBackToList} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
                <ArrowLeft size={20} />
              </button>
              <span className="font-medium text-sm truncate">{selectedNote.title}</span>
            </div>
            <div className="flex-1 overflow-hidden">
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
                undoEdit={undoEdit}
                redoEdit={redoEdit}
                canUndo={canUndo}
                canRedo={canRedo}
                insertMarkdown={insertMarkdown}
                handleImageUpload={handleImageUpload}
                textAreaRef={textAreaRef}
                fileInputRef={fileInputRef}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteDetail({ selectedNote, isEditing, editTitle, editContent, setEditTitle, setEditContent, setIsEditing, saveNote, deleteNote, undoEdit, redoEdit, canUndo, canRedo, insertMarkdown, handleImageUpload, textAreaRef, fileInputRef }: any) {
  if (!selectedNote) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 bg-white dark:bg-zinc-900/50 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800">
        选择一个笔记以查看或编辑
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900/50 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 p-4 overflow-hidden">
      <div className="flex justify-between items-center mb-4 border-b dark:border-slate-800 pb-2">
        {isEditing ? (
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="text-lg md:text-xl font-bold bg-transparent border-b focus:outline-none text-slate-800 dark:text-slate-200 flex-1"
          />
        ) : (
          <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-200 truncate">{selectedNote.title}</h2>
        )}

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
          <button onClick={() => deleteNote(selectedNote.id)} className="text-red-600 hover:text-red-700 bg-red-50 dark:bg-red-900/20 p-1.5 md:p-2 rounded"><Trash size={18} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {isEditing ? (
          <div className="h-full flex flex-col border border-zinc-200 dark:border-zinc-700 rounded">
            <div className="flex flex-wrap items-center gap-0.5 p-1.5 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 overflow-x-auto">
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
              className="w-full flex-1 resize-none focus:outline-none bg-transparent text-zinc-800 dark:text-zinc-200 font-mono p-3 text-sm"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder="开始写作..."
            />
          </div>
        ) : (
          <div className="prose dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 overflow-y-auto h-full text-sm">
            <MessageRenderer content={selectedNote.content} />
          </div>
        )}
      </div>
    </div>
  );
}

function NotesList({ notes, selectedNote, onSelectNote, createNote, moveNote, sortMode, setSortMode, sortDirection, setSortDirection }: any) {
  return (
    <div className="md:w-80 md:border-r md:border-zinc-200 md:dark:border-zinc-800 md:pr-4 flex flex-col relative shrink-0">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-2">
          <button onClick={createNote} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 transition-colors">
            <Plus size={16} /> 新建笔记
          </button>
        </div>
        {/* Sort Toolbar */}
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          <button
            onClick={() => setSortMode('name')}
            className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'name' ? "bg-white dark:bg-zinc-700 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")}
            title="按名称"
          ><SortAsc size={14} /></button>
          <button
            onClick={() => setSortMode('lastAccessed')}
            className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'lastAccessed' ? "bg-white dark:bg-zinc-700 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")}
            title="按时间"
          ><Clock size={14} /></button>
          <button
            onClick={() => setSortMode('manual')}
            className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'manual' ? "bg-white dark:bg-zinc-700 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")}
            title="手动"
          ><GripVertical size={14} /></button>
          <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-1" />
          <button
            onClick={() => setSortDirection((prev: any) => prev === 'asc' ? 'desc' : 'asc')}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            {sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </button>
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto flex-1">
        {notes?.map((note: any, idx: number) => (
          <div
            key={note.id}
            onClick={async () => {
              onSelectNote(note);
            }}
            className={cn(
              "p-3 rounded cursor-pointer transition-all group relative animate-in slide-in-from-left duration-300",
              selectedNote?.id === note.id ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'
            )}
            style={{ animationDelay: `${idx * 30}ms` }}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate text-slate-800 dark:text-slate-200">{note.title}</div>
                <div className="text-xs text-slate-500">{new Date(note.updatedAt).toLocaleDateString()}</div>
              </div>
              {sortMode === 'manual' && (
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={(e) => moveNote(e, note.id, 'up')}
                    disabled={idx === 0}
                    className="p-0.5 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 disabled:opacity-0"
                  ><ArrowUp size={12} /></button>
                  <button
                    onClick={(e) => moveNote(e, note.id, 'down')}
                    disabled={idx === (notes?.length || 0) - 1}
                    className="p-0.5 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 disabled:opacity-0"
                  ><ArrowDown size={12} /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
