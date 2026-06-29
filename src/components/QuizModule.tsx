import { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Entity, QuizRecord } from '@/db';
import {
  Plus, Trash, Edit, ArrowUp, ArrowDown, SortAsc, Clock, GripVertical,
  CheckCircle2, FileText, ListChecks, Type, AlignLeft, X, Check, XCircle, RefreshCw,
  Image as ImageIcon, Bold, Italic, Strikethrough, List, ListOrdered, Heading1, Heading2, Heading3,
  Quote, Code, Link as LinkIcon, Upload, ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DataManager } from '@/services/dataManager';
import { cn, generateUUID } from '@/lib/utils';
import { useDialog } from '@/components/ui/DialogProvider';
import { MessageRenderer } from '@/components/MessageRenderer';
import { useUIContext } from '@/hooks/useUIContext';
import { useResizable } from '@/hooks/useResizable';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

interface QuizModuleProps {
  subjectId: string;
}

export interface Question {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'fill_in_blank' | 'true_false' | 'short_answer' | 'essay';
  text: string;
  options?: string[];
  answer?: any;
  explanation?: string;
}

interface QuizContent {
  questions: Question[];
}

function getQuestionTypeLabel(type: string) {
  const map: Record<string, string> = {
    single_choice: '单选', multiple_choice: '多选', fill_in_blank: '填空',
    true_false: '判断', short_answer: '简答', essay: '解答'
  };
  return map[type] || type;
}

// ─── 答案工具函数 ───

function normalizeAnswerToIndexArray(answer: any): string[] {
  if (answer === null || answer === undefined) return [];
  let rawList: any[] = [];
  if (Array.isArray(answer)) {
    rawList = answer;
  } else if (typeof answer === 'string') {
    const trimmed = answer.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        rawList = Array.isArray(parsed) ? parsed : [parsed];
      } catch { rawList = trimmed.split(',').map(s => s.trim()).filter(s => s !== ''); }
    } else {
      rawList = trimmed.split(',').map(s => s.trim()).filter(s => s !== '');
    }
  } else { rawList = [answer]; }
  return rawList.map(item => {
    const s = String(item).trim().toUpperCase();
    return /^[A-Z]$/.test(s) ? String(s.charCodeAt(0) - 65) : s;
  });
}

function normalizeTrueFalseAnswer(answer: any): boolean | null {
  if (answer === true) return true;
  if (answer === false) return false;
  if (typeof answer === 'string') {
    const lower = answer.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return null;
}

function formatAnswer(answer: any, question: Question) {
  if (question.type === 'single_choice' || question.type === 'multiple_choice') {
    const indices = normalizeAnswerToIndexArray(answer);
    if (indices.length === 0) return '无';
    return indices.map(idx => {
      const val = parseInt(idx);
      return isNaN(val) ? idx : String.fromCharCode(65 + val);
    }).sort().join(', ');
  }
  if (question.type === 'true_false') {
    const n = normalizeTrueFalseAnswer(answer);
    return n === true ? '正确' : n === false ? '错误' : '无';
  }
  return String(answer || '无');
}

// ─── 题目作答状态 ───

type QuestionStatus = 'unanswered' | 'correct' | 'incorrect' | 'answered';

function getQuestionStatus(record: QuizRecord | undefined): QuestionStatus {
  if (!record) return 'unanswered';
  if (record.isCorrect === true) return 'correct';
  if (record.isCorrect === false) return 'incorrect';
  return 'answered';
}

/** 根据作答状态返回小方格样式 */
function statusTileClass(status: QuestionStatus): string {
  const base = "w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors active:scale-95";
  switch (status) {
    case 'correct':
      return `${base} bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800 hover:bg-green-200 dark:hover:bg-green-900/50`;
    case 'incorrect':
      return `${base} bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 hover:bg-red-200 dark:hover:bg-red-900/50`;
    case 'answered':
      return `${base} bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-900/50`;
    default:
      return `${base} bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400`;
  }
}

/** 移动端大方格样式 */
function statusTileClassMobile(status: QuestionStatus): string {
  const base = "w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors active:scale-95";
  switch (status) {
    case 'correct':
      return `${base} bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800`;
    case 'incorrect':
      return `${base} bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800`;
    case 'answered':
      return `${base} bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800`;
    default:
      return `${base} bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400`;
  }
}

// ─── 通用子组件 ───

function AddButton({ onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 p-2 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors text-xs font-medium text-zinc-600 dark:text-zinc-300">
      {icon}{label}
    </button>
  );
}

function ImageUploadButton({ onUpload, className }: { onUpload: (markdown: string) => void, className?: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        let id = generateUUID();
        await db.attachments.add({ id, data: base64, mimeType: file.type, fileName: file.name, createdAt: Date.now() });
        onUpload(`![Image](attachment:${id})`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  return (
    <>
      <button onClick={() => fileInputRef.current?.click()} className={cn("p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors", className)} title="插入图片"><ImageIcon size={16} /></button>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
    </>
  );
}

function MarkdownEditor({ value, onChange, placeholder, minHeight = "80px", autoFocus }: { value: string, onChange: (val: string) => void, placeholder?: string, minHeight?: string, autoFocus?: boolean }) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const insertMarkdown = (prefix: string, suffix: string = '', blockMode: boolean = false) => {
    if (!textAreaRef.current) return;
    const start = textAreaRef.current.selectionStart;
    const end = textAreaRef.current.selectionEnd;
    const text = value;
    const before = text.substring(0, start);
    const selection = text.substring(start, end);
    const after = text.substring(end);
    const scrollTop = textAreaRef.current.scrollTop;
    let aP = prefix, aS = suffix;
    if (blockMode) {
      if (start > 0 && text[start - 1] !== '\n') aP = '\n' + aP;
      if (end < text.length && text[end] !== '\n') aS = aS + '\n';
    }
    const nc = before + aP + selection + aS + after;
    onChange(nc);
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
        const pos = selection.length === 0 && suffix.length > 0 ? start + aP.length : start + aP.length + selection.length + aS.length;
        textAreaRef.current.setSelectionRange(pos, pos);
        textAreaRef.current.scrollTop = scrollTop;
      }
    }, 0);
  };
  const handleImageUpload = (markdown: string) => {
    if (!textAreaRef.current) { onChange(value + (value ? '\n' : '') + markdown); return; }
    const start = textAreaRef.current.selectionStart;
    const end = textAreaRef.current.selectionEnd;
    const text = value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    let insertion = markdown;
    if (start > 0 && text[start - 1] !== '\n') insertion = '\n' + insertion;
    if (end < text.length && text[end] !== '\n') insertion = insertion + '\n';
    const nc = before + insertion + after;
    onChange(nc);
    setTimeout(() => {
      if (textAreaRef.current) { textAreaRef.current.focus(); textAreaRef.current.setSelectionRange(start + insertion.length, start + insertion.length); }
    }, 0);
  };
  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
      <div className="flex flex-wrap items-center gap-0.5 p-1 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
        <button onClick={() => insertMarkdown('**', '**')} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="加粗"><Bold size={14} /></button>
        <button onClick={() => insertMarkdown('*', '*')} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="斜体"><Italic size={14} /></button>
        <button onClick={() => insertMarkdown('~~', '~~')} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="删除线"><Strikethrough size={14} /></button>
        <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-1" />
        <button onClick={() => insertMarkdown('# ', '', true)} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="一级标题"><Heading1 size={14} /></button>
        <button onClick={() => insertMarkdown('## ', '', true)} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="二级标题"><Heading2 size={14} /></button>
        <button onClick={() => insertMarkdown('### ', '', true)} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="三级标题"><Heading3 size={14} /></button>
        <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-1" />
        <button onClick={() => insertMarkdown('- ', '', true)} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="无序列表"><List size={14} /></button>
        <button onClick={() => insertMarkdown('1. ', '', true)} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="有序列表"><ListOrdered size={14} /></button>
        <button onClick={() => insertMarkdown('> ', '', true)} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="引用"><Quote size={14} /></button>
        <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-1" />
        <button onClick={() => insertMarkdown('```\n', '\n```', true)} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="代码块"><Code size={14} /></button>
        <button onClick={() => insertMarkdown('[', '](url)')} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="链接"><LinkIcon size={14} /></button>
        <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-1" />
        <ImageUploadButton onUpload={handleImageUpload} className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" />
      </div>
      <textarea ref={textAreaRef} value={value} onChange={e => onChange(e.target.value)} className="w-full p-2 bg-transparent border-0 focus:ring-0 text-sm resize-y outline-none block" style={{ minHeight }} placeholder={placeholder} autoFocus={autoFocus} />
    </div>
  );
}

// ─── 题目查看/答题组件 ───

function QuestionViewer({ question, index, quizId, existingRecord, onEdit, onDelete, onRecordSaved }: { question: Question, index: number, quizId: string, existingRecord?: QuizRecord | null, onEdit: () => void, onDelete: () => void, onRecordSaved?: () => void }) {
  const [userAnswer, setUserAnswer] = useState<any>(question.type === 'multiple_choice' ? [] : '');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  useEffect(() => {
    if (existingRecord) {
      setUserAnswer(existingRecord.userAnswer ?? (question.type === 'multiple_choice' ? [] : ''));
      setIsSubmitted(true); setAttemptCount(existingRecord.attemptCount || 1);
    } else {
      setUserAnswer(question.type === 'multiple_choice' ? [] : ''); setIsSubmitted(false); setAttemptCount(0);
    }
  }, [question.id, existingRecord]);
  const handleSubmit = async () => {
    setIsSubmitted(true);
    const isObj = ['single_choice', 'multiple_choice', 'true_false'].includes(question.type);
    let correct: boolean | null = null;
    if (isObj) {
      if (question.type === 'true_false') {
        const nu = normalizeTrueFalseAnswer(userAnswer), nc = normalizeTrueFalseAnswer(question.answer);
        correct = nu !== null && nc !== null && nu === nc;
      } else {
        const nu = normalizeAnswerToIndexArray(userAnswer).sort(), nc = normalizeAnswerToIndexArray(question.answer).sort();
        correct = question.type === 'single_choice' ? nu.length > 0 && nc.length > 0 && nu[0] === nc[0]
          : nu.length === nc.length && nu.every((v, i) => v === nc[i]);
      }
    }
    const nc = (existingRecord?.attemptCount || 0) + 1; setAttemptCount(nc);
    await db.quizRecords.put({ id: `${quizId}_${question.id}`, quizId, questionId: question.id, userAnswer, isCorrect: correct, attemptedAt: Date.now(), attemptCount: nc });
    onRecordSaved?.();
  };
  const handleReset = () => { setIsSubmitted(false); setUserAnswer(question.type === 'multiple_choice' ? [] : ''); };
  const isObj = ['single_choice', 'multiple_choice', 'true_false'].includes(question.type);
  let isCorrect = false;
  if (isSubmitted && isObj) {
    if (question.type === 'true_false') {
      const nu = normalizeTrueFalseAnswer(userAnswer), nc = normalizeTrueFalseAnswer(question.answer);
      isCorrect = nu !== null && nc !== null && nu === nc;
    } else {
      const nu = normalizeAnswerToIndexArray(userAnswer).sort(), nc = normalizeAnswerToIndexArray(question.answer).sort();
      isCorrect = question.type === 'single_choice' ? nu.length > 0 && nc.length > 0 && nu[0] === nc[0]
        : nu.length === nc.length && nu.every((v, i) => v === nc[i]);
    }
  }
  return (
    <div className="relative group">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 space-y-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs px-2 py-0.5 rounded font-medium shrink-0">{getQuestionTypeLabel(question.type)}</span>
            <span className="text-zinc-400 text-xs shrink-0">#{index + 1}</span>
            {isSubmitted && isObj && (isCorrect ? <span className="text-green-600 text-xs font-bold flex items-center gap-1 shrink-0"><CheckCircle2 size={14}/> 回答正确</span> : <span className="text-red-600 text-xs font-bold flex items-center gap-1 shrink-0"><XCircle size={14}/> 回答错误</span>)}
            {attemptCount > 0 && <span className="text-zinc-400 text-xs shrink-0">作答 {attemptCount} 次</span>}
          </div>
          <div className="text-lg text-zinc-800 dark:text-zinc-200">{question.text ? <MessageRenderer content={question.text} /> : <span className="text-zinc-400 italic">（未填写题目）</span>}</div>
          <div className="ml-1">
            {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
              <div className="space-y-2">
                {question.options?.map((opt, i) => {
                  const nu = normalizeAnswerToIndexArray(userAnswer), isSel = nu.includes(String(i));
                  let cls = "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800";
                  if (isSubmitted) {
                    const nc = normalizeAnswerToIndexArray(question.answer), isAns = nc.includes(String(i));
                    if (isAns) cls = "border-green-500 bg-green-50 dark:bg-green-900/20";
                    else if (isSel && !isAns) cls = "border-red-500 bg-red-50 dark:bg-red-900/20";
                    else cls = "opacity-60";
                  } else if (isSel) cls = "border-blue-500 bg-blue-50 dark:bg-blue-900/20";
                  return (
                    <div key={i} onClick={() => { if (isSubmitted) return; const si = String(i); if (question.type === 'single_choice') setUserAnswer([si]); else { const c = Array.isArray(userAnswer) ? userAnswer.map(String) : normalizeAnswerToIndexArray(userAnswer); setUserAnswer(c.includes(si) ? c.filter((x: string) => x !== si) : [...c, si]); } }}
                      className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all", cls)}>
                      <div className={cn("w-6 h-6 flex items-center justify-center border rounded-full text-xs font-medium shrink-0 transition-colors mt-0.5", isSel ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-zinc-800 text-zinc-500")}>{String.fromCharCode(65 + i)}</div>
                      <div className="flex-1 min-w-0 text-sm text-zinc-800 dark:text-zinc-200"><MessageRenderer content={opt} /></div>
                    </div>
                  );
                })}
              </div>
            )}
            {question.type === 'true_false' && (
              <div className="flex gap-4">
                {[true, false].map(val => {
                  const isSel = userAnswer === val; let cls = "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300";
                  if (isSubmitted) { const nc = normalizeTrueFalseAnswer(question.answer), isAns = nc === val; if (isAns) cls = "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700"; else if (isSel && !isAns) cls = "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700"; else cls = "opacity-50"; }
                  else if (isSel) cls = "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700";
                  return <button key={String(val)} onClick={() => !isSubmitted && setUserAnswer(val)} className={cn("px-4 py-2 border rounded-lg text-sm font-medium transition-all flex items-center gap-2", cls)}>{val ? <Check size={16} /> : <X size={16} />}{val ? "正确" : "错误"}</button>;
                })}
              </div>
            )}
            {(question.type === 'fill_in_blank' || question.type === 'short_answer') && <input value={userAnswer} onChange={e => setUserAnswer(e.target.value)} disabled={isSubmitted} className="w-full border rounded p-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-70 disabled:bg-zinc-100 dark:disabled:bg-zinc-800" placeholder="输入你的答案..." />}
            {question.type === 'essay' && <textarea value={userAnswer} onChange={e => setUserAnswer(e.target.value)} disabled={isSubmitted} className="w-full border rounded p-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[100px] disabled:opacity-70 disabled:bg-zinc-100 dark:disabled:bg-zinc-800" placeholder="输入你的回答..." />}
          </div>
          <div className="flex items-center gap-2 pt-2">
            {!isSubmitted ? <button onClick={handleSubmit} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md shadow-sm transition-colors">提交答案</button>
              : <button onClick={handleReset} className="px-4 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm rounded-md shadow-sm transition-colors flex items-center gap-1"><RefreshCw size={14} /> 重做</button>}
          </div>
          {isSubmitted && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/30 rounded-lg space-y-3 animate-in fade-in slide-in-from-top-2">
              <div><div className="text-xs font-bold text-yellow-800 dark:text-yellow-500 uppercase tracking-wider mb-1">参考答案</div><div className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">{question.type === 'essay' || question.type === 'short_answer' || question.type === 'fill_in_blank' ? <MessageRenderer content={String(question.answer)} /> : formatAnswer(question.answer, question)}</div></div>
              {question.explanation && <div><div className="text-xs font-bold text-yellow-800 dark:text-yellow-500 uppercase tracking-wider mb-1">解析</div><div className="text-sm text-zinc-700 dark:text-zinc-300"><MessageRenderer content={question.explanation} /></div></div>}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="编辑题目"><Edit size={16} /></button>
          <button onClick={onDelete} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="删除题目"><Trash size={16} /></button>
        </div>
      </div>
    </div>
  );
}

// ─── 题目编辑器 ───

function QuestionEditor({ question, onSave, onCancel }: { question: Question, onSave: (u: Partial<Question>) => void, onCancel: () => void }) {
  const [text, setText] = useState(question.text);
  const [options, setOptions] = useState<string[]>(question.options || []);
  const [answer, setAnswer] = useState<any>(question.answer);
  const [explanation, setExplanation] = useState(question.explanation || '');
  const handleSave = () => onSave({ text, options, answer, explanation });
  return (
    <div className="space-y-4">
      <div><div className="flex justify-between items-center mb-1"><label className="block text-xs font-medium text-zinc-500">题目内容</label></div><MarkdownEditor value={text} onChange={setText} placeholder="输入题目 (支持 Markdown 和图片)..." minHeight="120px" autoFocus /></div>
      {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
        <div><label className="block text-xs font-medium text-zinc-500 mb-1">选项</label><div className="space-y-2">
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <button onClick={() => { const sl = String.fromCharCode(65 + idx); if (question.type === 'single_choice') setAnswer(sl); else { const c = normalizeAnswerToIndexArray(answer).map(i => String.fromCharCode(65 + parseInt(i))); setAnswer(c.includes(sl) ? c.filter(l => l !== sl) : [...c, sl]); } }}
                className={cn("w-6 h-6 flex items-center justify-center border rounded text-xs transition-colors shrink-0 mt-1", normalizeAnswerToIndexArray(answer).includes(String(idx)) ? "bg-green-500 text-white border-green-600" : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-500 hover:border-zinc-400")} title="设为正确答案">{String.fromCharCode(65 + idx)}</button>
              <div className="flex-1 flex gap-2"><textarea value={opt} onChange={e => { const no = [...options]; no[idx] = e.target.value; setOptions(no); }} className="flex-1 border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm min-h-[38px] resize-y" placeholder={`选项 ${String.fromCharCode(65 + idx)}`} rows={1} /><ImageUploadButton className="mt-1" onUpload={(md) => { const no = [...options]; no[idx] = no[idx] + ' ' + md; setOptions(no); }} /></div>
              <button onClick={() => setOptions(options.filter((_, i) => i !== idx))} className="text-zinc-400 hover:text-red-500 mt-1"><X size={16} /></button>
            </div>
          ))}<button onClick={() => setOptions([...options, ''])} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus size={14} /> 添加选项</button>
        </div></div>
      )}
      {question.type === 'true_false' && <div><label className="block text-xs font-medium text-zinc-500 mb-1">答案</label><div className="flex gap-4"><label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={normalizeTrueFalseAnswer(answer) === true} onChange={() => setAnswer(true)} className="text-blue-600" /><span className="text-sm">正确</span></label><label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={normalizeTrueFalseAnswer(answer) === false} onChange={() => setAnswer(false)} className="text-blue-600" /><span className="text-sm">错误</span></label></div></div>}
      {(question.type === 'fill_in_blank' || question.type === 'short_answer') && <div><div className="flex justify-between items-center mb-1"><label className="block text-xs font-medium text-zinc-500">参考答案</label><ImageUploadButton onUpload={(md) => setAnswer((prev: string) => (prev || '') + '\n' + md)} /></div><textarea value={answer || ''} onChange={e => setAnswer(e.target.value)} className="w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm min-h-[40px]" placeholder="输入正确答案..." /></div>}
      {question.type === 'essay' && <div><div className="flex justify-between items-center mb-1"><label className="block text-xs font-medium text-zinc-500">参考答案 / 评分要点</label></div><MarkdownEditor value={answer || ''} onChange={setAnswer} placeholder="输入参考答案..." minHeight="120px" /></div>}
      <div><div className="flex justify-between items-center mb-1"><label className="block text-xs font-medium text-zinc-500">解析</label></div><MarkdownEditor value={explanation} onChange={setExplanation} placeholder="输入答案解析（可选）..." minHeight="100px" /></div>
      <div className="flex justify-end gap-2 pt-2"><button onClick={onCancel} className="px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 rounded">取消</button><button onClick={handleSave} className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded shadow-sm">保存</button></div>
    </div>
  );
}

// ─── 题目导航组件（桌面端） ───

function QuizNavigation({
  questions, recordMap, onBack, onSelectQuestion,
}: {
  questions: Question[];
  recordMap: Map<string, QuizRecord>;
  onBack: () => void;
  onSelectQuestion: (index: number) => void;
}) {
  const grouped = useMemo(() => {
    const typeOrder = ['single_choice', 'multiple_choice', 'true_false', 'fill_in_blank', 'short_answer', 'essay'];
    const groups: { type: string; label: string; indices: number[] }[] = [];
    const seen = new Set<string>();
    for (const t of typeOrder) {
      const indices: number[] = [];
      questions.forEach((q, i) => { if (q.type === t) indices.push(i); });
      if (indices.length > 0) { groups.push({ type: t, label: getQuestionTypeLabel(t), indices }); seen.add(t); }
    }
    questions.forEach((q, i) => { if (!seen.has(q.type)) { const e = groups.find(g => g.type === q.type); if (e) e.indices.push(i); else { groups.push({ type: q.type, label: getQuestionTypeLabel(q.type), indices: [i] }); seen.add(q.type); } } });
    return groups;
  }, [questions]);

  return (
    <div className="md:border-r md:border-zinc-200 md:dark:border-zinc-800 md:pr-4 flex flex-col shrink-0 h-full w-full">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <button onClick={onBack} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg" title="返回列表"><ArrowLeft size={20} /></button>
        <span className="font-medium text-sm text-zinc-600 dark:text-zinc-400">题目导航</span>
        <span className="text-xs text-zinc-400 ml-auto">{questions.length} 题</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-4">
        {grouped.map(({ type, label, indices }) => (
          <div key={type}>
            <div className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />{label}<span className="text-zinc-400">({indices.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {indices.map(idx => {
                const q = questions[idx];
                const status = getQuestionStatus(recordMap.get(q.id));
                return (
                  <button
                    key={idx}
                    onClick={() => onSelectQuestion(idx)}
                    className={statusTileClass(status)}
                    title={`第 ${idx + 1} 题 · ${getQuestionTypeLabel(q.type)}${status === 'correct' ? ' · 已答对' : status === 'incorrect' ? ' · 答错' : status === 'answered' ? ' · 已作答' : ' · 未作答'}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 移动端题目导航 ───

function MobileQuizNav({
  questions, recordMap, onSelectQuestion,
}: {
  questions: Question[];
  recordMap: Map<string, QuizRecord>;
  onSelectQuestion: (index: number) => void;
}) {
  const grouped = useMemo(() => {
    const typeOrder = ['single_choice', 'multiple_choice', 'true_false', 'fill_in_blank', 'short_answer', 'essay'];
    const groups: { type: string; label: string; indices: number[] }[] = [];
    const seen = new Set<string>();
    for (const t of typeOrder) {
      const indices: number[] = [];
      questions.forEach((q, i) => { if (q.type === t) indices.push(i); });
      if (indices.length > 0) { groups.push({ type: t, label: getQuestionTypeLabel(t), indices }); seen.add(t); }
    }
    questions.forEach((q, i) => { if (!seen.has(q.type)) { const e = groups.find(g => g.type === q.type); if (e) e.indices.push(i); else { groups.push({ type: q.type, label: getQuestionTypeLabel(q.type), indices: [i] }); seen.add(q.type); } } });
    return groups;
  }, [questions]);

  return (
    <div className="space-y-4">
      {grouped.map(({ type, label, indices }) => (
        <div key={type}>
          <div className="text-xs font-medium text-zinc-500 mb-2 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />{label}<span className="text-zinc-400">({indices.length}题)</span></div>
          <div className="flex flex-wrap gap-2">
            {indices.map(idx => {
              const q = questions[idx];
              const status = getQuestionStatus(recordMap.get(q.id));
              return (
                <button
                  key={idx}
                  onClick={() => onSelectQuestion(idx)}
                  className={statusTileClassMobile(status)}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 状态图例 ───

function StatusLegend() {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500 mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-zinc-200 dark:bg-zinc-700" /> 未做</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 dark:bg-green-800/50" /> 正确</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 dark:bg-red-800/50" /> 错误</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-800/50" /> 已做</span>
    </div>
  );
}

// ─── 题库编辑器组件 ───

/**
 * 仅滚动容器自身到指定题目索引位置，不影响窗口或祖先元素。
 * 使用 ResizeObserver 修正 mermaid / katex 等异步渲染导致的布局偏移。
 */
function scrollToQuestionInContainer(index: number, container: HTMLElement) {
  const scrollContainerTo = (smooth: boolean) => {
    const el = container.querySelector(`[data-question-index="${index}"]`) as HTMLElement | null;
    if (!el) return false;
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = el.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop;
    container.scrollTo({ top: Math.max(0, offset - 8), behavior: smooth ? 'smooth' : 'auto' });
    return true;
  };
  if (!scrollContainerTo(true)) return;
  let retries = 0;
  const maxRetries = 5;
  const observer = new ResizeObserver(() => {
    if (retries < maxRetries) { retries++; scrollContainerTo(false); } else observer.disconnect();
  });
  observer.observe(container);
  setTimeout(() => observer.disconnect(), 4000);
}

function QuizEditor({ quiz, isEditingTitle, setIsEditingTitle, editTitle, setEditTitle, onUpdateTitle, onDeleteQuiz, scrollToIndex, onScrollComplete, sidebarWidth }: any) {
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const questions = (quiz.content as QuizContent)?.questions || [];
  const { showConfirm } = useDialog();
  const questionListRef = useRef<HTMLDivElement>(null);
  const records = useLiveQuery(() => db.quizRecords.where({ quizId: quiz.id }).toArray(), [quiz.id]);
  const recordMap = useMemo(() => { const m = new Map<string, QuizRecord>(); if (records) records.forEach(r => m.set(r.questionId, r)); return m; }, [records]);
  const stats = useMemo(() => { if (!records || records.length === 0) return null; const a = records.length, c = records.filter(r => r.isCorrect === true).length, o = records.filter(r => r.isCorrect !== null).length; return { attempted: a, correctCount: c, objectiveTotal: o }; }, [records]);

  // 滚动到指定题目（含渲染修正）
  useEffect(() => {
    if (scrollToIndex !== null && scrollToIndex !== undefined && questionListRef.current) {
      const raf = requestAnimationFrame(() => {
        if (questionListRef.current) scrollToQuestionInContainer(scrollToIndex, questionListRef.current);
        setTimeout(() => onScrollComplete?.(), 4000);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [scrollToIndex, onScrollComplete]);

  const handleExport = async () => { try { await DataManager.downloadBackup({ entityIds: [quiz.id] }); } catch (e) { alert('导出失败'); } };
  const updateQuestions = async (nq: Question[]) => { await db.entities.update(quiz.id, { content: { ...quiz.content, questions: nq }, updatedAt: Date.now() }); };
  const addQuestion = async (type: Question['type']) => {
    const nq: Question = { id: generateUUID(), type, text: '', options: ['single_choice', 'multiple_choice'].includes(type) ? ['', '', '', ''] : undefined, answer: type === 'true_false' ? true : '' };
    await updateQuestions([...questions, nq]); setEditingQuestionId(nq.id);
  };
  const updateQuestion = async (id: string, u: Partial<Question>) => { await updateQuestions(questions.map(q => q.id === id ? { ...q, ...u } : q)); setEditingQuestionId(null); };
  const deleteQuestion = async (id: string) => { const c = await showConfirm("确认删除此题目？"); if (c) { await updateQuestions(questions.filter(q => q.id !== id)); await db.quizRecords.delete(`${quiz.id}_${id}`); } };
  const [, setRefreshKey] = useState(0);
  const handleRecordSaved = () => setRefreshKey(k => k + 1);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex-1">
          {isEditingTitle ? <input value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={onUpdateTitle} onKeyDown={e => e.key === 'Enter' && onUpdateTitle()} className="text-xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none w-full text-zinc-800 dark:text-zinc-200" autoFocus />
            : <h2 onClick={() => { setEditTitle(quiz.title); setIsEditingTitle(true); }} className="text-xl font-bold text-zinc-800 dark:text-zinc-200 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-2 -ml-2 py-1 transition-colors">{quiz.title}</h2>}
          <div className="text-xs text-zinc-500 mt-1 ml-1 space-x-2">
            <span>共 {questions.length} 题</span><span>·</span><span>创建于 {new Date(quiz.createdAt).toLocaleDateString()}</span>
            {stats && <><span>·</span><span className="text-blue-600 dark:text-blue-400">已练 {stats.attempted}/{questions.length} 题</span>{stats.objectiveTotal > 0 && <><span>·</span><span className="text-green-600 dark:text-green-400">正确率 {Math.round((stats.correctCount / stats.objectiveTotal) * 100)}%</span></>}</>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="导出题库"><Upload size={18} /></button>
          <button onClick={onDeleteQuiz} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="删除题库"><Trash size={18} /></button>
        </div>
      </div>
      <div ref={questionListRef} className={cn("flex-1 overflow-y-auto py-4", sidebarWidth < 250 ? "grid grid-cols-2 gap-4 items-start" : "space-y-6")} style={{ overscrollBehavior: 'contain' }}>
        {questions.length === 0 ? <div className="text-center py-20 text-zinc-400"><div className="mb-2">开始添加题目</div><div className="text-sm">点击下方按钮添加不同类型的题目</div></div>
          : questions.map((q, index) => (
            <div key={q.id} data-question-index={index} className="relative group/item bg-white dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800/50 p-4 transition-all hover:border-zinc-300 dark:hover:border-zinc-700" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }}>
              {editingQuestionId === q.id ? <QuestionEditor question={q} onSave={(updates) => updateQuestion(q.id, updates)} onCancel={() => setEditingQuestionId(null)} />
                : <QuestionViewer question={q} index={index} quizId={quiz.id} existingRecord={recordMap.get(q.id) || null} onEdit={() => setEditingQuestionId(q.id)} onDelete={() => deleteQuestion(q.id)} onRecordSaved={handleRecordSaved} />}
            </div>
          ))}
      </div>
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-3 sm:grid-cols-6 gap-2 shrink-0">
        <AddButton onClick={() => addQuestion('single_choice')} icon={<CheckCircle2 size={18} />} label="单选题" />
        <AddButton onClick={() => addQuestion('multiple_choice')} icon={<ListChecks size={18} />} label="多选题" />
        <AddButton onClick={() => addQuestion('true_false')} icon={<Check size={18} />} label="判断题" />
        <AddButton onClick={() => addQuestion('fill_in_blank')} icon={<Type size={18} />} label="填空题" />
        <AddButton onClick={() => addQuestion('short_answer')} icon={<AlignLeft size={18} />} label="简答题" />
        <AddButton onClick={() => addQuestion('essay')} icon={<FileText size={18} />} label="论述题" />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 题库模块主组件
// ══════════════════════════════════════════════════════════════════════

export function QuizModule({ subjectId }: QuizModuleProps) {
  const [sortMode, setSortMode] = useState<'name' | 'lastAccessed' | 'manual'>(() => (localStorage.getItem('quizSortMode') as any) || 'lastAccessed');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => (localStorage.getItem('quizSortDirection') as any) || 'desc');
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId]);
  const getCustomContext = useMemo(() => () => `用户正在查看题库模块。可以使用工具来管理题目。`, []);
  useUIContext({ location: 'quiz_module', subjectId, subjectName: subject?.name, contextId: `quiz-module-${subjectId}`, getCustomContext });

  useEffect(() => { localStorage.setItem('quizSortMode', sortMode); localStorage.setItem('quizSortDirection', sortDirection); }, [sortMode, sortDirection]);

  const quizzes = useLiveQuery(async () => {
    const all = await db.entities.where({ subjectId, type: 'quiz_bank' }).toArray();
    return all.sort((a, b) => {
      let vA: any, vB: any;
      if (sortMode === 'name') { vA = a.title; vB = b.title; return sortDirection === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA); }
      if (sortMode === 'lastAccessed') { vA = a.lastAccessed || 0; vB = b.lastAccessed || 0; }
      else if (sortMode === 'manual') { vA = a.order || 0; vB = b.order || 0; }
      else { vA = a.createdAt; vB = b.createdAt; }
      if (vA < vB) return sortDirection === 'asc' ? -1 : 1; if (vA > vB) return sortDirection === 'asc' ? 1 : -1; return 0;
    });
  }, [subjectId, sortMode, sortDirection]);

  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const selectedQuiz = quizzes?.find(q => q.id === selectedQuizId) || null;
  const [viewMode, setViewMode] = useState<'list' | 'nav' | 'detail'>('list');
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const { showConfirm } = useDialog();
  const { width: sidebarWidth, startResizing } = useResizable({
    initialWidth: 320,
    minWidth: 180,
    maxWidth: 500,
    key: 'quizSidebarWidth',
    direction: 'right'
  });

  // 查询当前选中题库的作答记录（用于导航状态色）
  const quizRecords = useLiveQuery(
    () => selectedQuizId ? db.quizRecords.where({ quizId: selectedQuizId }).toArray() : [],
    [selectedQuizId]
  );
  const recordMap = useMemo(() => {
    const map = new Map<string, QuizRecord>();
    if (quizRecords) quizRecords.forEach(r => map.set(r.questionId, r));
    return map;
  }, [quizRecords]);

  const createQuiz = async () => {
    const id = generateUUID(); const now = Date.now();
    await db.entities.add({ id, subjectId, type: 'quiz_bank' as const, title: '未命名题库', content: { questions: [] }, createdAt: now, updatedAt: now, lastAccessed: now, order: now });
    setSelectedQuizId(id); setEditTitle('未命名题库'); setIsEditingTitle(true); setViewMode('nav');
  };

  const deleteQuiz = async (id: string) => {
    const c = await showConfirm("确认删除此题库？", { title: "删除题库" });
    if (c) { await db.entities.delete(id); if (selectedQuizId === id) { setSelectedQuizId(null); setIsEditingTitle(false); setViewMode('list'); } }
  };

  const updateQuizTitle = async () => {
    if (!selectedQuiz) return;
    await db.entities.update(selectedQuiz.id, { title: editTitle, updatedAt: Date.now() });
    setIsEditingTitle(false);
  };

  const handleSelectQuiz = async (quiz: Entity) => {
    setSelectedQuizId(quiz.id); setEditTitle(quiz.title); setIsEditingTitle(false); setViewMode('nav'); setScrollToIndex(null);
    await db.entities.update(quiz.id, { lastAccessed: Date.now() });
  };
  const handleBackToList = () => { setSelectedQuizId(null); setIsEditingTitle(false); setViewMode('list'); setScrollToIndex(null); };
  const handleDetailBack = () => { setViewMode('nav'); setScrollToIndex(null); };
  const handleSelectQuestion = (index: number) => {
    if (window.innerWidth >= 768) { setScrollToIndex(index); setTimeout(() => setScrollToIndex(null), 100); }
    else { setViewMode('detail'); setScrollToIndex(index); }
  };
  const handleScrollComplete = () => setScrollToIndex(null);

  const questions = (selectedQuiz?.content as QuizContent)?.questions || [];

  const quizListContent = (
    <div className="md:border-r md:border-zinc-200 md:dark:border-zinc-800 md:pr-4 flex flex-col relative w-full h-full">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-2">
          <button onClick={createQuiz} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 transition-colors"><Plus size={16} /> 新建题库</button>
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          <button onClick={() => setSortMode('name')} className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'name' ? "bg-white dark:bg-zinc-700 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")} title="按名称"><SortAsc size={14} /></button>
          <button onClick={() => setSortMode('lastAccessed')} className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'lastAccessed' ? "bg-white dark:bg-zinc-700 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")} title="按时间"><Clock size={14} /></button>
          <button onClick={() => setSortMode('manual')} className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'manual' ? "bg-white dark:bg-zinc-700 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")} title="手动"><GripVertical size={14} /></button>
          <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-1" />
          <button onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 transition-colors">{sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</button>
        </div>
      </div>
      <div className="space-y-2 overflow-y-auto flex-1">
        {quizzes?.map((quiz, idx) => (
          <div key={quiz.id} onClick={() => handleSelectQuiz(quiz)} className={cn("p-3 rounded cursor-pointer transition-all group relative animate-in slide-in-from-left duration-300", selectedQuizId === quiz.id ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900')}
            style={{ animationDelay: `${idx * 30}ms`, contentVisibility: 'auto', containIntrinsicSize: 'auto 60px' }}>
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1"><div className="font-medium truncate text-slate-800 dark:text-slate-200">{quiz.title}</div><div className="text-xs text-slate-500">{new Date(quiz.updatedAt).toLocaleDateString()} · {(quiz.content as QuizContent)?.questions?.length || 0} 题</div></div>
              {sortMode === 'manual' && quizzes && quizzes.length > 1 && (
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={async (e) => { e.stopPropagation(); if (idx > 0 && quizzes) { const p = quizzes[idx - 1].order || 0, c = quiz.order || 0; await db.entities.update(quizzes[idx - 1].id, { order: c }); await db.entities.update(quiz.id, { order: p }); } }} disabled={idx === 0} className="p-0.5 text-zinc-400 hover:text-zinc-600 disabled:opacity-20 disabled:cursor-not-allowed"><ArrowUp size={12} /></button>
                  <button onClick={async (e) => { e.stopPropagation(); if (idx < quizzes.length - 1 && quizzes) { const n = quizzes[idx + 1].order || 0, c = quiz.order || 0; await db.entities.update(quizzes[idx + 1].id, { order: c }); await db.entities.update(quiz.id, { order: n }); } }} disabled={idx === quizzes.length - 1} className="p-0.5 text-zinc-400 hover:text-zinc-600 disabled:opacity-20 disabled:cursor-not-allowed"><ArrowDown size={12} /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── 桌面端布局 ──
  const desktopLayout = (
    <div className="hidden md:flex h-full gap-4 w-full">
      {/* 左侧面板：列表 ⇄ 导航 */}
      <div className="relative shrink-0 h-full" style={{ width: sidebarWidth }}>
        <AnimatePresence mode="wait">
          {!selectedQuiz ? (
            <motion.div key="quiz-list" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="h-full">
              {quizListContent}
            </motion.div>
          ) : (
            <motion.div key="quiz-nav" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="h-full">
              <QuizNavigation questions={questions} recordMap={recordMap} onBack={handleBackToList} onSelectQuestion={handleSelectQuestion} />
            </motion.div>
          )}
        </AnimatePresence>
        <ResizeHandle onMouseDown={startResizing} className="absolute right-0 top-0 bottom-0 translate-x-1/2" />
      </div>

      {/* 右侧面板：内容 */}
      <AnimatePresence mode="wait">
        {!selectedQuiz ? (
          <motion.div key="quiz-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="flex-1">
            <div className="h-full flex items-center justify-center text-zinc-400 bg-white dark:bg-zinc-900/50 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 text-sm">
              选择一个题库以查看或编辑，或者创建新题库。
            </div>
          </motion.div>
        ) : (
          <motion.div key={selectedQuiz.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.25 }} className="flex-1">
            <div className="h-full flex flex-col bg-white dark:bg-zinc-900/50 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 p-4 relative overflow-clip">
              <QuizEditor quiz={selectedQuiz} isEditingTitle={isEditingTitle} setIsEditingTitle={setIsEditingTitle} editTitle={editTitle} setEditTitle={setEditTitle} onUpdateTitle={updateQuizTitle} onDeleteQuiz={() => deleteQuiz(selectedQuiz.id)} scrollToIndex={scrollToIndex} onScrollComplete={handleScrollComplete} sidebarWidth={sidebarWidth} />
            </div>
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
          <motion.div key="m-list" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} className="flex-1 overflow-y-auto px-3 pt-3">
            {quizListContent}
          </motion.div>
        )}
        {viewMode === 'nav' && (
          <motion.div key="m-nav" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.2 }} className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
              <button onClick={handleBackToList} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"><ArrowLeft size={20} /></button>
              <span className="font-medium text-sm truncate">{selectedQuiz?.title}</span>
              <span className="text-xs text-zinc-400 ml-auto">{questions.length} 题</span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pt-3">
              <MobileQuizNav questions={questions} recordMap={recordMap} onSelectQuestion={handleSelectQuestion} />
              <StatusLegend />
            </div>
          </motion.div>
        )}
        {viewMode === 'detail' && (
          <motion.div key="m-detail" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.2 }} className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
              <button onClick={handleDetailBack} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"><ArrowLeft size={20} /></button>
              <span className="font-medium text-sm truncate">{selectedQuiz?.title}</span>
            </div>
            <div className="flex-1 overflow-clip p-3">
              <QuizEditor quiz={selectedQuiz} isEditingTitle={isEditingTitle} setIsEditingTitle={setIsEditingTitle} editTitle={editTitle} setEditTitle={setEditTitle} onUpdateTitle={updateQuizTitle} onDeleteQuiz={() => deleteQuiz(selectedQuiz!.id)} scrollToIndex={scrollToIndex} onScrollComplete={handleScrollComplete} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="flex h-full gap-4 relative pb-14 md:pb-0">
      {desktopLayout}
      {mobileLayout}
    </div>
  );
}
