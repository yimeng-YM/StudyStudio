import { useState, useCallback, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Entity } from '@/db';
import { 
  Plus, Trash, Edit, Save, ArrowUp, ArrowDown, SortAsc, Clock, GripVertical, 
  Image as ImageIcon, Undo, Redo,
  Bold, Italic, Strikethrough, List, ListOrdered, Heading1, Heading2, Heading3, 
  Quote, Code, Link as LinkIcon 
} from 'lucide-react';
import { MessageRenderer } from './MessageRenderer';
import { cn } from '@/lib/utils';
import { useDialog } from '@/components/ui/DialogProvider';
import { useHistory } from '@/hooks/useHistory';
import { useAIStore } from '@/store/useAIStore';

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

  const { setContext, setFloatingWindowOpen } = useAIStore();

  useEffect(() => {
    if (initialSessionId) {
      setChatSessionId(initialSessionId);
      setFloatingWindowOpen(true);
    }
  }, [initialSessionId, setFloatingWindowOpen]);

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

  const mindMap = useLiveQuery(
    () => db.entities.where({ subjectId, type: 'mindmap' }).first(),
    [subjectId]
  );

  const [selectedNote, setSelectedNote] = useState<Entity | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Undo/Redo Hook
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
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const { showAlert, showConfirm } = useDialog();

  // Clear chat session if no initial note/session
  useEffect(() => {
    if (!initialNoteId && !initialSessionId) {
      setChatSessionId(null);
    }
  }, [initialNoteId, initialSessionId]);

  useEffect(() => {
    if (initialNoteId && notes) {
      const target = notes.find(n => n.id === initialNoteId);
      if (target) {
        setSelectedNote(target);
        resetEditContent(target.content);
        setEditTitle(target.title);
        setIsEditing(false);
        // Only set if not overridden by initialSessionId
        if (!initialSessionId) {
          if (target.chatSessionId) {
            setChatSessionId(target.chatSessionId);
          } else {
            setChatSessionId(null);
          }
        }
      }
    }
  }, [initialNoteId, notes, resetEditContent, initialSessionId]);

  const createNote = async () => {
    const id = crypto.randomUUID();
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
    setChatSessionId(null); // New note, new session
  };

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
      await db.entities.delete(id);
      if (selectedNote?.id === id) {
        setSelectedNote(null);
        setIsEditing(false);
        resetEditContent('');
        setEditTitle('');
        setChatSessionId(null);
      }
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
        try {
          id = crypto.randomUUID();
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

  const handleAICommand = useCallback(async (command: any) => {
    if (command.action === 'update_note' && typeof command.content === 'string') {
      if (!selectedNote) {
        showAlert("在此模式下，AI 只能创建新笔记，无法修改现有笔记。", { title: "操作受限" });
        return;
      }

      setEditContent(command.content);
      setIsEditing(true);

      // Auto-save
      await db.entities.update(selectedNote.id, {
        content: command.content,
        updatedAt: Date.now()
      });

      const updated = await db.entities.get(selectedNote.id);
      setSelectedNote(updated || null);
      showAlert('笔记已由 AI 更新并保存', { title: 'AI 助手' });
    } else if (command.action === 'create_notes' && Array.isArray(command.notes)) {
      const now = Date.now();
      const newNotes = command.notes.map((n: any, index: number) => ({
        id: crypto.randomUUID(),
        subjectId,
        type: 'note',
        title: n.title || 'New Note',
        content: n.content || '',
        createdAt: now,
        updatedAt: now,
        lastAccessed: now,
        order: now + index
      }));

      await db.transaction('rw', db.entities, async () => {
        for (const note of newNotes) {
          await db.entities.add(note);
        }
      });

      showAlert(`已生成 ${newNotes.length} 篇新笔记`, { title: 'AI 助手' });
    }
  }, [selectedNote, subjectId, showAlert, setEditContent]);

  // AI Context Refs
  const notesRef = useRef(notes);
  const mindMapRef = useRef(mindMap);
  const selectedNoteRef = useRef(selectedNote);
  const editContentRef = useRef(editContent);
  const editTitleRef = useRef(editTitle);
  const isEditingRef = useRef(isEditing);

  useEffect(() => {
    notesRef.current = notes;
    mindMapRef.current = mindMap;
    selectedNoteRef.current = selectedNote;
    editContentRef.current = editContent;
    editTitleRef.current = editTitle;
    isEditingRef.current = isEditing;
  }, [notes, mindMap, selectedNote, editContent, editTitle, isEditing]);

  // Register AI Context
  useEffect(() => {
    const getSystemContext = () => {
      const _notes = notesRef.current;
      const _mindMap = mindMapRef.current;
      const _selectedNote = selectedNoteRef.current;
      const _editContent = editContentRef.current;
      const _editTitle = editTitleRef.current;
      const _isEditing = isEditingRef.current;

      let context = "You are an AI assistant helping with study notes.\n";

      if (_mindMap && _mindMap.content && _mindMap.content.nodes) {
        const nodes = _mindMap.content.nodes as any[];
        const structure = nodes.map(n => n.data.label).join(', ');
        context += `\nContext - Related Mind Map Structure:\n${structure}\n`;
      }

      if (_notes && _notes.length > 0) {
        context += `\nContext - Existing Note Titles:\n${_notes.map(n => n.title).join(', ')}\n`;
      }

      if (_selectedNote) {
        const currentContent = _isEditing ? _editContent : _selectedNote.content;
        const currentTitle = _isEditing ? _editTitle : _selectedNote.title;
        context += `\nContext - Current Note:\nTitle: ${currentTitle}\nContent:\n${currentContent}\n`;
      }

      context += `
Please assist the user in managing study notes. You can CREATE new notes or UPDATE the current note (if selected).

To CREATE multiple new notes, respond with:
\`\`\`json
{
  "action": "create_notes",
  "notes": [
    { "title": "Note 1", "content": "# Content 1..." },
    { "title": "Note 2", "content": "# Content 2..." }
  ]
}
\`\`\`
`;

      if (_selectedNote) {
        context += `
To UPDATE the current note, respond with:
\`\`\`json
{
  "action": "update_note",
  "content": "# New Title\\n\\nNew content..."
}
\`\`\`
IMPORTANT: When updating a note, you MUST provide the COMPLETE content. Do NOT omit any parts. The content you provide will COMPLETELY REPLACE the existing note.
`;
      }

      return context;
    };

    setContext({
      id: selectedNote ? selectedNote.id : undefined,
      sourceType: selectedNote ? 'note' : 'general',
      sessionId: chatSessionId,
      onSessionChange: async (sid) => {
        if (selectedNote) {
          await db.entities.update(selectedNote.id, { chatSessionId: sid });
        }
        setChatSessionId(sid);
      },
      getSystemContext,
      handleCommand: handleAICommand
    });

    return () => setContext(null);
  }, [subjectId, chatSessionId, handleAICommand, setContext, selectedNote]);

  return (
    <div className="flex h-full gap-4 relative">
      <NotesList
        notes={notes}
        selectedNote={selectedNote}
        setSelectedNote={setSelectedNote}
        setEditContent={setEditContent}
        setEditTitle={setEditTitle}
        setIsEditing={setIsEditing}
        setChatSessionId={setChatSessionId}
        createNote={createNote}
        moveNote={moveNote}
        sortMode={sortMode}
        setSortMode={setSortMode}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
      />

      <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 p-4 relative overflow-hidden">
        {selectedNote ? (
          <>
            <div className="flex justify-between items-center mb-4 border-b dark:border-slate-800 pb-2">
              {isEditing ? (
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="text-xl font-bold bg-transparent border-b focus:outline-none text-slate-800 dark:text-slate-200"
                />
              ) : (
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">{selectedNote.title}</h2>
              )}

              <div className="flex gap-2">
                {/* AI Button Removed */}
                {isEditing ? (
                  <>
                    <button
                      onClick={undoEdit}
                      disabled={!canUndo}
                      className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-600 dark:text-slate-400 transition-colors"
                      title="撤销"
                    >
                      <Undo size={20} />
                    </button>
                    <button
                      onClick={redoEdit}
                      disabled={!canRedo}
                      className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-600 dark:text-slate-400 transition-colors"
                      title="重做"
                    >
                      <Redo size={20} />
                    </button>

                    <button onClick={saveNote} className="text-green-600 hover:text-green-700 bg-green-50 dark:bg-green-900/20 p-2 rounded"><Save size={20} /></button>
                  </>
                ) : (
                  <button onClick={() => setIsEditing(true)} className="text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20 p-2 rounded"><Edit size={20} /></button>
                )}

                {isEditing && (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-slate-600 hover:text-slate-700 bg-slate-50 dark:bg-slate-800 p-2 rounded"
                      title="插入图片"
                    >
                      <ImageIcon size={20} />
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </>
                )}

                <button onClick={() => deleteNote(selectedNote.id)} className="text-red-600 hover:text-red-700 bg-red-50 dark:bg-red-900/20 p-2 rounded"><Trash size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex gap-4">
              <div className={`flex-1 flex flex-col min-w-0 h-full ${isEditing ? 'border border-slate-200 dark:border-slate-700 rounded' : ''}`}>
                {isEditing ? (
                  <>
                    <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <button onClick={() => insertMarkdown('**', '**')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="加粗"><Bold size={16} /></button>
                      <button onClick={() => insertMarkdown('*', '*')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="斜体"><Italic size={16} /></button>
                      <button onClick={() => insertMarkdown('~~', '~~')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="删除线"><Strikethrough size={16} /></button>
                      <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
                      <button onClick={() => insertMarkdown('# ', '', true)} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="一级标题"><Heading1 size={16} /></button>
                      <button onClick={() => insertMarkdown('## ', '', true)} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="二级标题"><Heading2 size={16} /></button>
                      <button onClick={() => insertMarkdown('### ', '', true)} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="三级标题"><Heading3 size={16} /></button>
                      <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
                      <button onClick={() => insertMarkdown('- ', '', true)} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="无序列表"><List size={16} /></button>
                      <button onClick={() => insertMarkdown('1. ', '', true)} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="有序列表"><ListOrdered size={16} /></button>
                      <button onClick={() => insertMarkdown('> ', '', true)} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="引用"><Quote size={16} /></button>
                      <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
                      <button onClick={() => insertMarkdown('```\n', '\n```', true)} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="代码块"><Code size={16} /></button>
                      <button onClick={() => insertMarkdown('[', '](url)')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="链接"><LinkIcon size={16} /></button>
                    </div>
                    <textarea
                      ref={textAreaRef}
                      className="w-full h-full resize-none focus:outline-none bg-transparent text-slate-800 dark:text-slate-200 font-mono p-3 border-0"
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      placeholder="开始写作..."
                    />
                  </>
                ) : (
                  <div className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 overflow-y-auto">
                    <MessageRenderer content={selectedNote.content} />
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
            选择一个笔记以查看或编辑，或者使用 AI 助手创建新笔记。
          </div>
        )}
      </div>
    </div>
  );
}

function NotesList({ notes, selectedNote, setSelectedNote, setEditContent, setEditTitle, setIsEditing, setChatSessionId, createNote, moveNote, sortMode, setSortMode, sortDirection, setSortDirection }: any) {
  return (
    <div className="w-80 border-r pr-4 flex flex-col relative shrink-0">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-2">
          <button onClick={createNote} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 transition-colors">
            <Plus size={16} /> 新建笔记
          </button>
        </div>
        {/* Sort Toolbar */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <button
            onClick={() => setSortMode('name')}
            className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'name' ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}
            title="按名称"
          ><SortAsc size={14} /></button>
          <button
            onClick={() => setSortMode('lastAccessed')}
            className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'lastAccessed' ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}
            title="按时间"
          ><Clock size={14} /></button>
          <button
            onClick={() => setSortMode('manual')}
            className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'manual' ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}
            title="手动"
          ><GripVertical size={14} /></button>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
          <button
            onClick={() => setSortDirection((prev: any) => prev === 'asc' ? 'desc' : 'asc')}
            className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
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
              setSelectedNote(note);
              setEditContent(note.content);
              setEditTitle(note.title);
              setIsEditing(false);
              setChatSessionId(note.chatSessionId || null);
              await db.entities.update(note.id, { lastAccessed: Date.now() });
            }}
            className={cn(
              "p-3 rounded cursor-pointer transition-all group relative animate-in slide-in-from-left duration-300",
              selectedNote?.id === note.id ? 'bg-slate-200 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-900'
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
