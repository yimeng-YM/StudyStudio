import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Entity } from '@/db';
import {
  Plus, Trash, Edit, ArrowUp, ArrowDown, SortAsc, Clock, GripVertical,
  CheckCircle2, FileText, ListChecks, Type, AlignLeft, X, Check, XCircle, RefreshCw,
  Image as ImageIcon, Bold, Italic, Strikethrough, List, ListOrdered, Heading1, Heading2, Heading3,
  Quote, Code, Link as LinkIcon, Download, Upload
} from 'lucide-react';
import { DataManager } from '@/services/dataManager';
import { cn } from '@/lib/utils';
import { useDialog } from '@/components/ui/DialogProvider';
import { MessageRenderer } from '@/components/MessageRenderer';

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
    single_choice: '单选',
    multiple_choice: '多选',
    fill_in_blank: '填空',
    true_false: '判断',
    short_answer: '简答',
    essay: '解答'
  };
  return map[type] || type;
}

function formatAnswer(answer: any, question: Question) {
  if (question.type === 'single_choice') {
    return `选项 ${String.fromCharCode(65 + parseInt(answer))}`;
  }
  if (question.type === 'multiple_choice' && Array.isArray(answer)) {
    return answer.map((i: string) => String.fromCharCode(65 + parseInt(i))).sort().join(', ');
  }
  if (question.type === 'true_false') {
    return answer ? '正确' : '错误';
  }
  return String(answer || '无');
}

function AddButton({ onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 p-2 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors text-xs font-medium text-zinc-600 dark:text-zinc-300"
    >
      {icon}
      {label}
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
        let id = crypto.randomUUID();
        await db.attachments.add({
          id,
          data: base64,
          mimeType: file.type,
          fileName: file.name,
          createdAt: Date.now()
        });
        onUpload(`![Image](attachment:${id})`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        className={cn("p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors", className)}
        title="插入图片"
      >
        <ImageIcon size={16} />
      </button>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
      />
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
    onChange(newContent);

    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
        const newCursorPos = selection.length === 0 && suffix.length > 0
          ? start + actualPrefix.length
          : start + actualPrefix.length + selection.length + actualSuffix.length;
        textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleImageUpload = (markdown: string) => {
    if (!textAreaRef.current) {
      onChange(value + (value ? '\n' : '') + markdown);
      return;
    }

    const start = textAreaRef.current.selectionStart;
    const end = textAreaRef.current.selectionEnd;
    const text = value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    // Ensure newlines around image if needed
    let insertion = markdown;
    if (start > 0 && text[start - 1] !== '\n') insertion = '\n' + insertion;
    if (end < text.length && text[end] !== '\n') insertion = insertion + '\n';

    const newContent = before + insertion + after;
    onChange(newContent);
    
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
        const newCursorPos = start + insertion.length;
        textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
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
        <ImageUploadButton 
          onUpload={handleImageUpload} 
          className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
        />
      </div>
      <textarea
        ref={textAreaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full p-2 bg-transparent border-0 focus:ring-0 text-sm resize-y outline-none block"
        style={{ minHeight }}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}

function QuestionViewer({ question, index, onEdit, onDelete }: { question: Question, index: number, onEdit: () => void, onDelete: () => void }) {
  const [userAnswer, setUserAnswer] = useState<any>(question.type === 'multiple_choice' ? [] : '');
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Reset state when question changes (e.g. reordering)
  useEffect(() => {
    setUserAnswer(question.type === 'multiple_choice' ? [] : '');
    setIsSubmitted(false);
  }, [question.id]);

  const handleSubmit = () => setIsSubmitted(true);
  const handleReset = () => {
    setIsSubmitted(false);
    setUserAnswer(question.type === 'multiple_choice' ? [] : '');
  };

  const isObjective = ['single_choice', 'multiple_choice', 'true_false'].includes(question.type);
  
  // Logic to determine correctness for objective questions
  let isCorrect = false;
  if (isSubmitted && isObjective) {
    if (question.type === 'single_choice') {
      isCorrect = String(userAnswer) === String(question.answer);
    } else if (question.type === 'true_false') {
      isCorrect = String(userAnswer) === String(question.answer);
    } else if (question.type === 'multiple_choice') {
      const user = Array.isArray(userAnswer) ? userAnswer.map(String).sort() : [];
      const correct = Array.isArray(question.answer) ? question.answer.map(String).sort() : [];
      isCorrect = JSON.stringify(user) === JSON.stringify(correct);
    }
  }

  return (
    <div className="relative group">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 space-y-3 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs px-2 py-0.5 rounded font-medium shrink-0">
              {getQuestionTypeLabel(question.type)}
            </span>
            <span className="text-zinc-400 text-xs shrink-0">#{index + 1}</span>
            {isSubmitted && isObjective && (
              isCorrect ? (
                <span className="text-green-600 text-xs font-bold flex items-center gap-1 shrink-0"><CheckCircle2 size={14}/> 回答正确</span>
              ) : (
                <span className="text-red-600 text-xs font-bold flex items-center gap-1 shrink-0"><XCircle size={14}/> 回答错误</span>
              )
            )}
          </div>

          {/* Question Text */}
          <div className="text-lg text-zinc-800 dark:text-zinc-200">
            {question.text ? <MessageRenderer content={question.text} /> : <span className="text-zinc-400 italic">（未填写题目）</span>}
          </div>

          {/* Options / Input Area */}
          <div className="ml-1">
            {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
              <div className="space-y-2">
                {question.options?.map((opt, i) => {
                  const isSelected = question.type === 'single_choice' 
                    ? String(userAnswer) === String(i)
                    : (Array.isArray(userAnswer) && userAnswer.includes(String(i)));
                  
                  // For submitted objective questions, highlight correct/incorrect
                  let optionClass = "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800";
                  if (isSubmitted) {
                    const isAnswer = question.type === 'single_choice' 
                      ? String(question.answer) === String(i)
                      : (Array.isArray(question.answer) && question.answer.includes(String(i)));
                    
                    if (isAnswer) optionClass = "border-green-500 bg-green-50 dark:bg-green-900/20";
                    else if (isSelected && !isAnswer) optionClass = "border-red-500 bg-red-50 dark:bg-red-900/20";
                    else optionClass = "opacity-60"; // Dim others
                  } else if (isSelected) {
                    optionClass = "border-blue-500 bg-blue-50 dark:bg-blue-900/20";
                  }

                  return (
                    <div 
                      key={i} 
                      onClick={() => {
                        if (isSubmitted) return;
                        if (question.type === 'single_choice') {
                          setUserAnswer(String(i));
                        } else {
                          const current = Array.isArray(userAnswer) ? userAnswer : [];
                          const sIdx = String(i);
                          if (current.includes(sIdx)) {
                            setUserAnswer(current.filter((x: string) => x !== sIdx));
                          } else {
                            setUserAnswer([...current, sIdx]);
                          }
                        }
                      }}
                      className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all", optionClass)}
                    >
                      <div className={cn(
                        "w-6 h-6 flex items-center justify-center border rounded-full text-xs font-medium shrink-0 transition-colors mt-0.5",
                        isSelected ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-zinc-800 text-zinc-500"
                      )}>
                        {String.fromCharCode(65 + i)}
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-zinc-800 dark:text-zinc-200">
                        <MessageRenderer content={opt} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {question.type === 'true_false' && (
              <div className="flex gap-4">
                {[true, false].map((val) => {
                  const isSelected = userAnswer === val;
                  let btnClass = "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300";
                  
                  if (isSubmitted) {
                    const isAnswer = question.answer === val;
                    if (isAnswer) btnClass = "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700";
                    else if (isSelected && !isAnswer) btnClass = "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700";
                    else btnClass = "opacity-50";
                  } else if (isSelected) {
                    btnClass = "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700";
                  }

                  return (
                    <button
                      key={String(val)}
                      onClick={() => !isSubmitted && setUserAnswer(val)}
                      className={cn("px-4 py-2 border rounded-lg text-sm font-medium transition-all flex items-center gap-2", btnClass)}
                    >
                      {val ? <Check size={16} /> : <X size={16} />}
                      {val ? "正确" : "错误"}
                    </button>
                  );
                })}
              </div>
            )}

            {(question.type === 'fill_in_blank' || question.type === 'short_answer') && (
              <div className="space-y-2">
                <input
                  value={userAnswer}
                  onChange={e => setUserAnswer(e.target.value)}
                  disabled={isSubmitted}
                  className="w-full border rounded p-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-70 disabled:bg-zinc-100 dark:disabled:bg-zinc-800"
                  placeholder="输入你的答案..."
                />
              </div>
            )}

            {question.type === 'essay' && (
              <div className="space-y-2">
                <textarea
                  value={userAnswer}
                  onChange={e => setUserAnswer(e.target.value)}
                  disabled={isSubmitted}
                  className="w-full border rounded p-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[100px] disabled:opacity-70 disabled:bg-zinc-100 dark:disabled:bg-zinc-800"
                  placeholder="输入你的回答..."
                />
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2 pt-2">
            {!isSubmitted ? (
              <button 
                onClick={handleSubmit}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md shadow-sm transition-colors"
              >
                提交答案
              </button>
            ) : (
              <button 
                onClick={handleReset}
                className="px-4 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm rounded-md shadow-sm transition-colors flex items-center gap-1"
              >
                <RefreshCw size={14} /> 重做
              </button>
            )}
          </div>

          {/* Answer & Explanation (Shown after submit) */}
          {isSubmitted && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/30 rounded-lg space-y-3 animate-in fade-in slide-in-from-top-2">
              <div>
                <div className="text-xs font-bold text-yellow-800 dark:text-yellow-500 uppercase tracking-wider mb-1">参考答案</div>
                <div className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">
                  {question.type === 'essay' || question.type === 'short_answer' || question.type === 'fill_in_blank' 
                    ? <MessageRenderer content={String(question.answer)} />
                    : formatAnswer(question.answer, question)
                  }
                </div>
              </div>
              {question.explanation && (
                <div>
                  <div className="text-xs font-bold text-yellow-800 dark:text-yellow-500 uppercase tracking-wider mb-1">解析</div>
                  <div className="text-sm text-zinc-700 dark:text-zinc-300">
                    <MessageRenderer content={question.explanation} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit Controls (Hover) */}
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="编辑题目"><Edit size={16} /></button>
          <button onClick={onDelete} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="删除题目"><Trash size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({ question, onSave, onCancel }: { question: Question, onSave: (u: Partial<Question>) => void, onCancel: () => void }) {
  const [text, setText] = useState(question.text);
  const [options, setOptions] = useState<string[]>(question.options || []);
  const [answer, setAnswer] = useState<any>(question.answer);
  const [explanation, setExplanation] = useState(question.explanation || '');

  const handleSave = () => {
    onSave({ text, options, answer, explanation });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-xs font-medium text-zinc-500">题目内容</label>
        </div>
        <MarkdownEditor
          value={text}
          onChange={setText}
          placeholder="输入题目 (支持 Markdown 和图片)..."
          minHeight="120px"
          autoFocus
        />
      </div>

      {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">选项</label>
          <div className="space-y-2">
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <button
                  onClick={() => {
                    if (question.type === 'single_choice') {
                      setAnswer(String(idx));
                    } else {
                      const current = Array.isArray(answer) ? answer : [];
                      const sIdx = String(idx);
                      if (current.includes(sIdx)) {
                        setAnswer(current.filter((i: string) => i !== sIdx));
                      } else {
                        setAnswer([...current, sIdx]);
                      }
                    }
                  }}
                  className={cn(
                    "w-6 h-6 flex items-center justify-center border rounded text-xs transition-colors shrink-0 mt-1",
                    (question.type === 'single_choice' ? String(answer) === String(idx) : (Array.isArray(answer) && answer.includes(String(idx))))
                      ? "bg-green-500 text-white border-green-600"
                      : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-500 hover:border-zinc-400"
                  )}
                  title="设为正确答案"
                >
                  {String.fromCharCode(65 + idx)}
                </button>
                <div className="flex-1 flex gap-2">
                  <textarea
                    value={opt}
                    onChange={e => {
                      const newOpts = [...options];
                      newOpts[idx] = e.target.value;
                      setOptions(newOpts);
                    }}
                    className="flex-1 border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm min-h-[38px] resize-y"
                    placeholder={`选项 ${String.fromCharCode(65 + idx)}`}
                    rows={1}
                  />
                  <ImageUploadButton 
                    className="mt-1"
                    onUpload={(md) => {
                      const newOpts = [...options];
                      newOpts[idx] = newOpts[idx] + ' ' + md;
                      setOptions(newOpts);
                    }} 
                  />
                </div>
                <button onClick={() => {
                  const newOpts = options.filter((_, i) => i !== idx);
                  setOptions(newOpts);
                }} className="text-zinc-400 hover:text-red-500 mt-1"><X size={16} /></button>
              </div>
            ))}
            <button
              onClick={() => setOptions([...options, ''])}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus size={14} /> 添加选项
            </button>
          </div>
        </div>
      )}

      {question.type === 'true_false' && (
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">答案</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                checked={answer === true} 
                onChange={() => setAnswer(true)} 
                className="text-blue-600"
              /> 
              <span className="text-sm">正确</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                checked={answer === false} 
                onChange={() => setAnswer(false)}
                className="text-blue-600"
              /> 
              <span className="text-sm">错误</span>
            </label>
          </div>
        </div>
      )}

      {(question.type === 'fill_in_blank' || question.type === 'short_answer') && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-xs font-medium text-zinc-500">参考答案</label>
            <ImageUploadButton onUpload={(md) => setAnswer((prev: string) => (prev || '') + '\n' + md)} />
          </div>
          <textarea
            value={answer || ''}
            onChange={e => setAnswer(e.target.value)}
            className="w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm min-h-[40px]"
            placeholder="输入正确答案..."
          />
        </div>
      )}

      {question.type === 'essay' && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-xs font-medium text-zinc-500">参考答案 / 评分要点</label>
          </div>
          <MarkdownEditor
            value={answer || ''}
            onChange={setAnswer}
            placeholder="输入参考答案..."
            minHeight="120px"
          />
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-xs font-medium text-zinc-500">解析</label>
        </div>
        <MarkdownEditor
          value={explanation}
          onChange={setExplanation}
          placeholder="输入答案解析（可选）..."
          minHeight="100px"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 rounded">取消</button>
        <button onClick={handleSave} className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded shadow-sm">保存</button>
      </div>
    </div>
  );
}

function QuizEditor({ quiz, isEditingTitle, setIsEditingTitle, editTitle, setEditTitle, onUpdateTitle, onDeleteQuiz }: any) {
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const questions = (quiz.content as QuizContent)?.questions || [];
  const { showConfirm } = useDialog();

  const handleExport = async () => {
    try {
      await DataManager.downloadBackup({ entityIds: [quiz.id] });
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败');
    }
  };

  const updateQuestions = async (newQuestions: Question[]) => {
    await db.entities.update(quiz.id, {
      content: { ...quiz.content, questions: newQuestions },
      updatedAt: Date.now()
    });
  };

  const addQuestion = async (type: Question['type']) => {
    const newQuestion: Question = {
      id: crypto.randomUUID(),
      type,
      text: '',
      options: ['single_choice', 'multiple_choice'].includes(type) ? ['', '', '', ''] : undefined,
      answer: type === 'true_false' ? true : '',
    };
    await updateQuestions([...questions, newQuestion]);
    setEditingQuestionId(newQuestion.id);
  };

  const updateQuestion = async (id: string, updates: Partial<Question>) => {
    const newQuestions = questions.map(q => q.id === id ? { ...q, ...updates } : q);
    await updateQuestions(newQuestions);
    setEditingQuestionId(null);
  };

  const deleteQuestion = async (id: string) => {
    const confirmed = await showConfirm("确认删除此题目？");
    if (confirmed) {
      const newQuestions = questions.filter(q => q.id !== id);
      await updateQuestions(newQuestions);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex-1">
          {isEditingTitle ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={onUpdateTitle}
              onKeyDown={e => e.key === 'Enter' && onUpdateTitle()}
              className="text-xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none w-full text-zinc-800 dark:text-zinc-200"
              autoFocus
            />
          ) : (
            <h2 
              onClick={() => {
                setEditTitle(quiz.title);
                setIsEditingTitle(true);
              }}
              className="text-xl font-bold text-zinc-800 dark:text-zinc-200 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-2 -ml-2 py-1 transition-colors"
            >
              {quiz.title}
            </h2>
          )}
          <div className="text-xs text-zinc-500 mt-1 ml-1">
            共 {questions.length} 题 · 创建于 {new Date(quiz.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExport}
            className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
            title="导出题库"
          >
            <Upload size={18} />
          </button>
           <button 
            onClick={onDeleteQuiz}
            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
            title="删除题库"
          >
            <Trash size={18} />
          </button>
        </div>
      </div>

      {/* Question List */}
      <div className="flex-1 overflow-y-auto py-4 space-y-6">
        {questions.length === 0 ? (
          <div className="text-center py-20 text-zinc-400">
            <div className="mb-2">开始添加题目</div>
            <div className="text-sm">点击下方按钮添加不同类型的题目</div>
          </div>
        ) : (
          questions.map((q, index) => (
            <div key={q.id} className="relative group/item bg-white dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800/50 p-4 transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
              {editingQuestionId === q.id ? (
                <QuestionEditor 
                  question={q} 
                  onSave={(updates) => updateQuestion(q.id, updates)} 
                  onCancel={() => setEditingQuestionId(null)} 
                />
              ) : (
                <QuestionViewer 
                  question={q} 
                  index={index}
                  onEdit={() => setEditingQuestionId(q.id)}
                  onDelete={() => deleteQuestion(q.id)}
                />
              )}

            </div>
          ))
        )}
      </div>

      {/* Add Question Toolbar */}
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

export function QuizModule({ subjectId }: QuizModuleProps) {
  const [sortMode, setSortMode] = useState<'name' | 'lastAccessed' | 'manual'>(() =>
    (localStorage.getItem('quizSortMode') as any) || 'lastAccessed');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() =>
    (localStorage.getItem('quizSortDirection') as any) || 'desc');

  useEffect(() => {
    localStorage.setItem('quizSortMode', sortMode);
    localStorage.setItem('quizSortDirection', sortDirection);
  }, [sortMode, sortDirection]);

  const quizzes = useLiveQuery(async () => {
    const allQuizzes = await db.entities.where({ subjectId, type: 'quiz_bank' }).toArray();

    return allQuizzes.sort((a, b) => {
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

  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const selectedQuiz = quizzes?.find(q => q.id === selectedQuizId) || null;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const { showConfirm } = useDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      await DataManager.importData(file);
      alert('导入成功');
    } catch (error) {
      console.error('Import failed:', error);
      alert('导入失败: ' + (error as any).message);
    }
    e.target.value = '';
  };

  const createQuiz = async () => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newQuiz = {
      id,
      subjectId,
      type: 'quiz_bank',
      title: '未命名题库',
      content: { questions: [] },
      createdAt: now,
      updatedAt: now,
      lastAccessed: now,
      order: now
    } as Entity;
    await db.entities.add(newQuiz);
    setSelectedQuizId(id);
    setEditTitle(newQuiz.title);
    setIsEditingTitle(true);
  };

  const deleteQuiz = async (id: string) => {
    const confirmed = await showConfirm("确认删除此题库？", { title: "删除题库" });
    if (confirmed) {
      await db.entities.delete(id);
      if (selectedQuizId === id) {
        setSelectedQuizId(null);
        setIsEditingTitle(false);
      }
    }
  };

  const updateQuizTitle = async () => {
    if (!selectedQuiz) return;
    await db.entities.update(selectedQuiz.id, {
      title: editTitle,
      updatedAt: Date.now()
    });
    setIsEditingTitle(false);
  };

  return (
    <div className="flex h-full gap-4 relative">
      {/* Quiz List (Left Sidebar) */}
      <div className="w-80 border-r pr-4 flex flex-col relative shrink-0">
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex gap-2">
            <button onClick={createQuiz} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 transition-colors">
              <Plus size={16} /> 新建题库
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              title="导入题库"
            >
              <Download size={16} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".json" 
              onChange={handleImport} 
            />
          </div>
          {/* Sort Toolbar */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
            <button onClick={() => setSortMode('name')} className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'name' ? "bg-white dark:bg-zinc-700 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")} title="按名称"><SortAsc size={14} /></button>
            <button onClick={() => setSortMode('lastAccessed')} className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'lastAccessed' ? "bg-white dark:bg-zinc-700 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")} title="按时间"><Clock size={14} /></button>
            <button onClick={() => setSortMode('manual')} className={cn("p-1.5 rounded transition-colors flex-1 flex justify-center", sortMode === 'manual' ? "bg-white dark:bg-zinc-700 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")} title="手动"><GripVertical size={14} /></button>
            <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600 mx-1" />
            <button onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 transition-colors">
              {sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            </button>
          </div>
        </div>

        <div className="space-y-2 overflow-y-auto flex-1">
          {quizzes?.map((quiz, idx) => (
            <div
              key={quiz.id}
              onClick={async () => {
                setSelectedQuizId(quiz.id);
                setEditTitle(quiz.title);
                setIsEditingTitle(false);
                await db.entities.update(quiz.id, { lastAccessed: Date.now() });
              }}
              className={cn(
                "p-3 rounded cursor-pointer transition-all group relative animate-in slide-in-from-left duration-300",
                selectedQuizId === quiz.id ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'
              )}
              style={{ animationDelay: `${idx * 30}ms` }}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate text-slate-800 dark:text-slate-200">{quiz.title}</div>
                  <div className="text-xs text-slate-500">{new Date(quiz.updatedAt).toLocaleDateString()} · {(quiz.content as QuizContent)?.questions?.length || 0} 题</div>
                </div>
                {/* Manual Sort Controls */}
                {sortMode === 'manual' && quizzes && quizzes.length > 1 && (
                  <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (idx > 0 && quizzes) {
                          const prevOrder = quizzes[idx - 1].order || 0;
                          const currOrder = quiz.order || 0;
                          await db.entities.update(quizzes[idx - 1].id, { order: currOrder });
                          await db.entities.update(quiz.id, { order: prevOrder });
                        }
                      }}
                      disabled={idx === 0}
                      className="p-0.5 text-zinc-400 hover:text-zinc-600 disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (idx < quizzes.length - 1 && quizzes) {
                          const nextOrder = quizzes[idx + 1].order || 0;
                          const currOrder = quiz.order || 0;
                          await db.entities.update(quizzes[idx + 1].id, { order: currOrder });
                          await db.entities.update(quiz.id, { order: nextOrder });
                        }
                      }}
                      disabled={idx === quizzes.length - 1}
                      className="p-0.5 text-zinc-400 hover:text-zinc-600 disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quiz Editor (Main Content) */}
      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900/50 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 p-4 relative overflow-hidden">
        {selectedQuiz ? (
          <QuizEditor 
            quiz={selectedQuiz} 
            isEditingTitle={isEditingTitle}
            setIsEditingTitle={setIsEditingTitle}
            editTitle={editTitle}
            setEditTitle={setEditTitle}
            onUpdateTitle={updateQuizTitle}
            onDeleteQuiz={() => deleteQuiz(selectedQuiz.id)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-400">
            选择一个题库以查看或编辑，或者创建新题库。
          </div>
        )}
      </div>
    </div>
  );
}
