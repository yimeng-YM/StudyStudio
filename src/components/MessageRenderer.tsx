import { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';

import 'katex/dist/katex.min.css';
import { MessageContentPart, ToolCall } from '@/services/ai';
import { FileText, FileSpreadsheet, FileCode, ChevronDown, ChevronRight, CheckCircle2, Loader2, Eye, GitCompare } from 'lucide-react';
import { db } from '@/db';
import mermaid from 'mermaid';
import { useTheme } from '@/hooks/useTheme';
import { parseAIJson } from '@/lib/utils';
import { Modal } from './ui/Modal';

/**
 * 内部 Hook：获取当前应用是否处于深色模式
 * 考虑了系统主题设置和手动切换
 */
function useIsDark() {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDark = () => {
      if (theme === 'dark') return true;
      if (theme === 'light') return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    };

    setIsDark(checkDark());

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  return isDark;
}

// 初始化 Mermaid 图表引擎
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

// 工具调用名称映射表（中文）
const TOOL_NAMES: Record<string, string> = {
  'get_subjects': '获取科目列表',
  'get_subject_details': '获取科目详情',
  'get_entity_content': '获取内容详情',
  'get_note_lines': '读取笔记片段',
  'get_quiz_questions': '读取题目详情',
  'read_file': '读取文件',
  'write_to_file': '写入文件',
  'list_files': '列出目录',
  'search_files': '搜索 Pattern',
  'execute_command': '执行命令',
  'create_subject': '创建科目',
  'update_subject': '更新科目',
  'create_mindmap': '创建思维导图',
  'update_mindmap': '更新思维导图',
  'add_mindmap_elements': '修改思维导图',
  'clear_mindmap': '清空思维导图',
  'create_note': '创建笔记',
  'update_note': '更新笔记',
  'patch_note_content': '精确编辑笔记',
  'create_quiz': '创建测验',
  'update_quiz': '更新测验',
  'patch_quiz_questions': '精确编辑题库',
  'create_taskboard': '创建任务板',
  'update_taskboard': '更新任务板',
  'codebase_search': '代码搜索',
  'apply_diff': '应用代码差异',
  'present_plan': '规划建议',
  'start_execution': '进入执行'
};

/**
 * 根据工具名称和参数生成易读的描述文字
 */
const getToolDescription = (name: string, args: string) => {
  try {
    const parsed = JSON.parse(args);
    switch (name) {
      case 'read_file': return `读取文件: ${parsed.path || (parsed.files && parsed.files[0] ? parsed.files[0].path : '')}`;
      case 'write_to_file': return `写入文件: ${parsed.path}`;
      case 'list_files': return `查看目录: ${parsed.path}`;
      case 'search_files': return `在 ${parsed.path} 搜索 "${parsed.regex || parsed.pattern}"`;
      case 'execute_command': return `执行: ${parsed.command}`;
      case 'get_subject_details': return `查看科目详情`;
      case 'get_entity_content': return `获取内容详情`;
      case 'create_mindmap': return `创建导图: ${parsed.title}`;
      case 'update_mindmap': return `更新导图: ${parsed.title || '（未命名）'}`;
      case 'add_mindmap_elements': return `修改导图: 添加/更新 ${parsed.nodes?.length || 0} 个节点`;
      case 'clear_mindmap': return `清空思维导图`;
      case 'create_note': return `创建笔记: ${parsed.title}`;
      case 'update_note': return `更新笔记: ${parsed.title || (parsed.entityId ? parsed.entityId.slice(0, 8) + '...' : '')}`;
      case 'patch_note_content': return `精确编辑笔记: "${(parsed.search || '').slice(0, 30).replace(/\n/g, '↵')}${(parsed.search || '').length > 30 ? '…' : ''}"`;
      case 'create_quiz': return `创建测验: ${parsed.title}`;
      case 'update_quiz': return `更新测验: ${parsed.title || (parsed.entityId ? parsed.entityId.slice(0, 8) + '...' : '')}`;
      case 'patch_quiz_questions': {
        const ops: any[] = parsed.operations || [];
        const counts = { add: 0, update: 0, delete: 0 } as Record<string, number>;
        ops.forEach((op: any) => { if (op.type in counts) counts[op.type]++; });
        const parts: string[] = [];
        if (counts.add)    parts.push(`新增 ${counts.add} 题`);
        if (counts.update) parts.push(`修改 ${counts.update} 题`);
        if (counts.delete) parts.push(`删除 ${counts.delete} 题`);
        return `精确编辑题库: ${parts.join('、') || '无操作'}`;
      }
      case 'get_note_lines': return `读取笔记第 ${parsed.start_line}–${parsed.end_line ?? '末尾'} 行`;
      case 'get_quiz_questions': return `读取题库题目`;
      case 'apply_diff': return `应用差异: ${parsed.path}`;
      case 'present_plan': return `规划方案已准备就绪`;
      case 'start_execution': return `正在初始化执行环境`;
      default: return `${TOOL_NAMES[name] || name}`;
    }
  } catch (e) {
    return `${TOOL_NAMES[name] || name}`;
  }
};

/**
 * 格式化工具参数以便在预览界面显示
 */
function formatToolArgs(args: string, name: string): string {
  try {
    const parsed = JSON.parse(args);
    
    // 针对不同工具返回更简洁的预览
    switch (name) {
      case 'present_plan':
        return parsed.plan_summary || '查看详细任务规划...';
      case 'create_mindmap':
      case 'update_mindmap':
        return `导图标题: ${parsed.title || '未命名'} (${parsed.content?.nodes?.length || 0} 个节点)`;
      case 'add_mindmap_elements':
        return `添加节点: ${parsed.nodes?.length || 0}, 连线: ${parsed.edges?.length || 0}`;
      case 'create_note':
      case 'update_note':
        return `笔记标题: ${parsed.title || '未命名'} (${(parsed.content || '').length} 字符)`;
      case 'patch_note_content': {
        const s = (parsed.search || '').slice(0, 60).replace(/\n/g, '↵');
        return `搜索: "${s}${(parsed.search || '').length > 60 ? '…' : ''}"`;
      }
      case 'create_quiz':
      case 'update_quiz':
        return `测验标题: ${parsed.title || '未命名'} (${parsed.content?.questions?.length || 0} 道题目)`;
      case 'patch_quiz_questions':
        return `${(parsed.operations || []).length} 个操作`;
      case 'create_taskboard':
      case 'update_taskboard':
        return `任务板标题: ${parsed.title || '未命名'} (${parsed.content?.nodes?.length || 0} 个阶段)`;
      case 'execute_command':
        return `指令: ${parsed.command}`;
      case 'read_file':
      case 'write_to_file':
        return `路径: ${parsed.path}`;
    }

    if (parsed.content) {
      if (typeof parsed.content === 'string') return parsed.content.slice(0, 100) + (parsed.content.length > 100 ? '...' : '');
      if (parsed.content.nodes) return `包含 ${parsed.content.nodes.length} 个节点`;
      return JSON.stringify(parsed.content).slice(0, 100);
    }
    
    const str = JSON.stringify(parsed);
    return str.length > 100 ? str.slice(0, 100) + '...' : str;
  } catch (e) {
    return args.slice(0, 100);
  }
}

// ─── Diff 视图相关逻辑 ───────────────────────────────────────────────────────

type DiffLineItem =
  | { kind: 'equal';  text: string; oldNum: number; newNum: number }
  | { kind: 'delete'; text: string; oldNum: number }
  | { kind: 'insert'; text: string; newNum: number };

/** LCS 行级 diff，最多处理每侧 600 行，超出部分附加截断提示 */
function computeLineDiff(before: string, after: string): DiffLineItem[] {
  const MAX = 600;
  const ol = before.split('\n').slice(0, MAX);
  const nl = after.split('\n').slice(0, MAX);
  const m = ol.length;
  const n = nl.length;

  // DP 表（Uint16Array 节省内存，上限 65535 已足够）
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = ol[i - 1] === nl[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // 回溯
  const result: DiffLineItem[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ol[i - 1] === nl[j - 1]) {
      result.unshift({ kind: 'equal', text: ol[i - 1], oldNum: i, newNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ kind: 'insert', text: nl[j - 1], newNum: j });
      j--;
    } else {
      result.unshift({ kind: 'delete', text: ol[i - 1], oldNum: i });
      i--;
    }
  }

  if (before.split('\n').length > MAX || after.split('\n').length > MAX) {
    result.push({ kind: 'insert', text: `… (内容过长，仅显示前 ${MAX} 行)`, newNum: MAX + 1 });
  }
  return result;
}

type CollapsedItem = DiffLineItem | { kind: 'collapse'; count: number };

/** 折叠连续未改动行，每处保留 context 行上下文 */
function collapseEqualLines(diff: DiffLineItem[], context = 3): CollapsedItem[] {
  const out: CollapsedItem[] = [];
  let i = 0;
  while (i < diff.length) {
    if (diff[i].kind !== 'equal') { out.push(diff[i++]); continue; }
    const start = i;
    while (i < diff.length && diff[i].kind === 'equal') i++;
    const len = i - start;
    const showBefore = start === 0 ? 0 : Math.min(context, len);
    const showAfter  = i === diff.length ? 0 : Math.min(context, len);
    const total = showBefore + showAfter;
    if (len <= total + 2) {
      for (let k = start; k < i; k++) out.push(diff[k]);
    } else {
      for (let k = start; k < start + showBefore; k++) out.push(diff[k]);
      out.push({ kind: 'collapse', count: len - showBefore - showAfter });
      for (let k = i - showAfter; k < i; k++) out.push(diff[k]);
    }
  }
  return out;
}

/** 行级 diff 可视化组件 */
function DiffViewer({ before, after }: { before: string; after: string }) {
  const [compact, setCompact] = useState(true);
  const diff = useMemo(() => computeLineDiff(before, after), [before, after]);
  const display = useMemo(
    () => compact ? collapseEqualLines(diff) : diff,
    [diff, compact]
  );

  const deleted  = diff.filter(l => l.kind === 'delete').length;
  const inserted = diff.filter(l => l.kind === 'insert').length;
  const hasChanges = deleted > 0 || inserted > 0;

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 text-xs font-mono">
      {/* 统计栏 */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        {inserted > 0 && (
          <span className="text-green-600 dark:text-green-400 font-semibold">+{inserted}</span>
        )}
        {deleted > 0 && (
          <span className="text-red-600 dark:text-red-400 font-semibold">-{deleted}</span>
        )}
        {!hasChanges && <span className="text-zinc-400">无改动</span>}
        <div className="flex-1" />
        <button
          onClick={() => setCompact(v => !v)}
          className="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 select-none"
        >
          {compact ? '展开全文' : '只看改动'}
        </button>
      </div>

      {/* diff 行 */}
      <div className="max-h-[55vh] overflow-y-auto">
        {display.map((item, idx) => {
          if (item.kind === 'collapse') {
            return (
              <div key={idx} className="flex items-center gap-2 px-3 py-1 bg-zinc-100/60 dark:bg-zinc-800/40 text-zinc-400 select-none cursor-pointer hover:bg-zinc-200/60 dark:hover:bg-zinc-700/40" onClick={() => setCompact(false)}>
                <span className="w-8 text-right" />
                <span className="w-8 text-right" />
                <span className="w-4 text-center">⋯</span>
                <span>{item.count} 行未改动，点击展开</span>
              </div>
            );
          }

          const isDelete = item.kind === 'delete';
          const isInsert = item.kind === 'insert';
          const oldNum = item.kind !== 'insert' ? item.oldNum : undefined;
          const newNum = item.kind !== 'delete' ? item.newNum : undefined;

          return (
            <div
              key={idx}
              className={`flex items-start group ${
                isDelete ? 'bg-red-500/10 hover:bg-red-500/15' :
                isInsert ? 'bg-green-500/10 hover:bg-green-500/15' :
                'hover:bg-zinc-500/5'
              }`}
            >
              {/* 旧行号 */}
              <span className="w-9 text-right px-1.5 py-0.5 text-zinc-400/70 select-none flex-shrink-0 border-r border-zinc-200/50 dark:border-zinc-700/50">
                {oldNum ?? ''}
              </span>
              {/* 新行号 */}
              <span className="w-9 text-right px-1.5 py-0.5 text-zinc-400/70 select-none flex-shrink-0 border-r border-zinc-200/50 dark:border-zinc-700/50">
                {newNum ?? ''}
              </span>
              {/* 类型符号 */}
              <span className={`w-5 text-center py-0.5 select-none flex-shrink-0 font-bold ${
                isDelete ? 'text-red-500 dark:text-red-400' :
                isInsert ? 'text-green-600 dark:text-green-400' :
                'text-zinc-300 dark:text-zinc-600'
              }`}>
                {isDelete ? '−' : isInsert ? '+' : ' '}
              </span>
              {/* 内容 */}
              <span className={`py-0.5 px-2 whitespace-pre-wrap break-all flex-1 min-w-0 ${
                isDelete ? 'text-red-800 dark:text-red-300' :
                isInsert ? 'text-green-800 dark:text-green-300' :
                'text-zinc-600 dark:text-zinc-400'
              }`}>
                {item.text || ' '}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * 工具调用渲染组件
 * 在对话中以卡片形式展示 AI 正在执行的工具操作
 */
export function ToolCallRenderer({ toolCalls, results = {} }: { toolCalls: ToolCall[], results?: Record<string, string> }) {
  const [selectedToolCall, setSelectedToolCall] = useState<ToolCall | null>(null);
  const [modalTab, setModalTab] = useState<'content' | 'diff'>('content');
  const isDark = useIsDark();

  // 打开某个工具卡时，如果有 diff 数据则默认展示"改动"页签
  useEffect(() => {
    if (selectedToolCall) {
      setModalTab(getResultDiff(selectedToolCall.id) ? 'diff' : 'content');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedToolCall]);

  const isEditable = (name: string) => {
    return name.startsWith('create_') ||
           name.startsWith('update_') ||
           name === 'apply_diff' ||
           name === 'write_to_file' ||
           name === 'add_mindmap_elements' ||
           name === 'patch_note_content' ||
           name === 'patch_quiz_questions' ||
           name === 'clear_mindmap' ||
           name === 'present_plan' ||
           name === 'start_execution';
  };

  /** 从工具结果 JSON 中提取 _diff 字段 */
  const getResultDiff = (tcId: string): { before: string; after: string } | null => {
    try {
      const parsed = JSON.parse(results[tcId] || '{}');
      return parsed._diff ?? null;
    } catch {
      return null;
    }
  };

  return (
    <div className="flex flex-col gap-2 my-2">
      {toolCalls.map((tc, idx) => {
        const result = results[tc.id];
        const isComplete = !!result;
        const canShowDiff = isEditable(tc.function.name);
        
        return (
          <div 
            key={tc.id || idx}
            onClick={() => canShowDiff && setSelectedToolCall(tc)}
            className={`flex flex-col bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300 ${canShowDiff ? 'cursor-pointer hover:border-primary/50 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 transition-all group' : ''}`}
          >
            <div className="flex items-center gap-3 px-4 py-2.5">
              <div className={isComplete ? "text-green-500" : "text-blue-500"}>
                {isComplete ? <CheckCircle2 size={16} /> : <Loader2 size={16} className="animate-spin" />}
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">
                    {TOOL_NAMES[tc.function.name] || tc.function.name}
                  </span>
                  {canShowDiff && (
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-primary font-medium">
                      <Eye size={10} /> {tc.function.name === 'present_plan' ? '查看规划详情' : '查看详情'}
                    </span>
                  )}
                </div>
                <span className="text-sm text-zinc-700 dark:text-zinc-200 truncate font-medium mt-1">
                  {getToolDescription(tc.function.name, tc.function.arguments)}
                </span>
              </div>
              {isComplete && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {getResultDiff(tc.id) && (
                    <span className="flex items-center gap-0.5 text-[10px] text-violet-500 dark:text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                      <GitCompare size={9} /> 改动
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">已完成</span>
                </div>
              )}
            </div>
            
            {tc.function.arguments && tc.function.name !== 'present_plan' && (
              <div className="px-4 pb-2.5 text-[10px] text-zinc-500 dark:text-zinc-400 font-mono line-clamp-2 break-all opacity-60 border-t border-zinc-100/50 dark:border-zinc-800/50 pt-1.5 mt-0.5">
                {formatToolArgs(tc.function.arguments, tc.function.name)}
              </div>
            )}
            {tc.function.name === 'present_plan' && (
              <div className="px-4 pb-2.5 text-[10px] text-primary/70 dark:text-primary/60 font-medium line-clamp-1 border-t border-zinc-100/50 dark:border-zinc-800/50 pt-1.5 mt-0.5 flex items-center gap-1">
                <FileText size={10} /> 点击查看详细任务规划
              </div>
            )}
          </div>
        );
      })}

      {/* 工具详情模态框 */}
      <Modal
        isOpen={!!selectedToolCall}
        onClose={() => setSelectedToolCall(null)}
        title={selectedToolCall ? `${TOOL_NAMES[selectedToolCall.function.name] || selectedToolCall.function.name} - 详细内容` : ''}
      >
        {selectedToolCall && (() => {
          const diff = getResultDiff(selectedToolCall.id);
          return (
            <div className="space-y-3">
              {/* 页签栏（仅当有 diff 数据时显示） */}
              {diff && (
                <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={() => setModalTab('diff')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      modalTab === 'diff'
                        ? 'bg-white dark:bg-zinc-800 shadow text-zinc-800 dark:text-zinc-200'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    <GitCompare size={12} /> 改动
                  </button>
                  <button
                    onClick={() => setModalTab('content')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      modalTab === 'content'
                        ? 'bg-white dark:bg-zinc-800 shadow text-zinc-800 dark:text-zinc-200'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    参数
                  </button>
                </div>
              )}

              {/* Diff 视图 */}
              {diff && modalTab === 'diff' && (
                <DiffViewer before={diff.before} after={diff.after} />
              )}

              {/* 原有参数/内容视图 */}
              {(!diff || modalTab === 'content') && (
                <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 p-1 bg-white dark:bg-zinc-950">
                  {(() => {
                    try {
                      const args = JSON.parse(selectedToolCall.function.arguments);

                      if (selectedToolCall.function.name === 'present_plan') {
                        return (
                          <div className="p-4 prose dark:prose-invert max-w-none max-h-[60vh] overflow-y-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                              {args.plan_summary || '暂无详细规划内容'}
                            </ReactMarkdown>
                          </div>
                        );
                      }

                      return (
                        <SyntaxHighlighter
                          style={isDark ? vscDarkPlus : prism}
                          language={selectedToolCall.function.name === 'apply_diff' ? 'diff' : 'json'}
                          PreTag="div"
                          className="!m-0 max-h-[60vh] overflow-y-auto text-xs"
                          wrapLongLines={true}
                        >
                          {(() => {
                            if (selectedToolCall.function.name === 'apply_diff' && args.diff) return args.diff;
                            if (args.content && typeof args.content === 'string') return args.content;
                            return JSON.stringify(args, null, 2);
                          })()}
                        </SyntaxHighlighter>
                      );
                    } catch {
                      return (
                        <div className="p-4 font-mono text-xs whitespace-pre-wrap">
                          {selectedToolCall.function.arguments}
                        </div>
                      );
                    }
                  })()}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setSelectedToolCall(null)}
                  className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

export function ToolResultRenderer(_props: { name: string, result: string }) {
  return null; // 结果现在直接集成在 ToolCallRenderer 中显示
}

interface MessageRendererProps {
  content: string | MessageContentPart[] | null;
  isUser?: boolean;
}

/**
 * 消息渲染主组件
 * 
 * 核心功能：
 * 1. 结构化处理：支持纯文本字符串或多模态内容数组。
 * 2. Markdown 解析：集成 ReactMarkdown 实现基础格式渲染。
 * 3. 复杂逻辑分发：根据内容类型（文字、图片等）调用对应的子组件。
 */
export function MessageRenderer({ content, isUser }: MessageRendererProps) {
  if (!content) return null;

  if (Array.isArray(content)) {
    return (
      <div className="space-y-2">
        {content.map((part, i) => {
          if (part.type === 'text') {
            return <MarkdownText key={i} content={part.text} isUser={isUser} />;
          } else if (part.type === 'image_url') {
            return (
              <img
                key={i}
                src={part.image_url.url}
                alt="Uploaded"
                className="max-w-full h-auto rounded-lg border border-slate-200 dark:border-slate-700"
              />
            );
          }
          return null;
        })}
      </div>
    );
  }

  return <MarkdownText content={content} isUser={isUser} />;
}

/**
 * 从文本中提取特殊的元数据标记（例如文件预览信息）
 */
function extractMetadata(text: string): [any | null, string] {
  const regex = /<<<FILE_METADATA=(.*?)>>>\n?/;
  const match = text.match(regex);
  if (match) {
    try {
      return [parseAIJson(match[1]), text.replace(match[0], '')];
    } catch (e) {
      return [null, text];
    }
  }
  return [null, text];
}

/**
 * 异步图片组件
 * 支持从 Dexie (IndexedDB) 加载 attachment: 协议的本地图片数据
 */
function AsyncImage(props: any) {
  const { src, alt, className } = props;
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    if (src?.startsWith('attachment:')) {
      const id = src.split(':')[1];
      setLoading(true);
      db.attachments.get(id)
        .then(attachment => {
          if (mounted && attachment) {
            setImageSrc(attachment.data);
          } else if (mounted) {
            console.warn(`Attachment ${id} not found`);
            setImageSrc(null);
          }
        })
        .catch(err => {
          console.error("Failed to load attachment", err);
          if (mounted) setImageSrc(null);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    } else {
      setImageSrc(src);
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [src]);

  if (loading) return <span className="text-slate-400 text-xs animate-pulse">[加载图片...]</span>;
  if (!imageSrc) return (
    <span className="text-red-400 text-xs" title={src}>
      [图片加载失败: {src?.split(':')[1]}]
    </span>
  );

  return <img src={imageSrc} alt={alt} className={className} />;
}

/**
 * Mermaid 图表组件
 * 使用 mermaid.js 动态渲染流程图、时序图等
 */
function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isDark = useIsDark();

  useEffect(() => {
    let mounted = true;

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'loose',
    });

    const renderChart = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        if (mounted) {
          setSvg(svg);
          setError(null);
        }
      } catch (e: any) {
        console.error("Mermaid Render Fail", e);
        if (mounted) {
          setError(e.message || "Invalid Diagram");
        }
      }
    };

    if (chart && mounted) {
      renderChart();
    }

    return () => { mounted = false; };
  }, [chart, isDark]);

  if (error) {
    return (
      <div className="p-2 border border-red-200 bg-red-50 text-red-800 rounded font-mono text-sm whitespace-pre-wrap">
        <div className="font-bold mb-1">Mermaid Error:</div>
        {error}
        <div className="mt-2 text-xs text-slate-500">Source:</div>
        <div className="text-xs text-slate-600">{chart}</div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="flex justify-center bg-white dark:bg-slate-900 p-4 rounded-lg my-4 overflow-x-auto border border-slate-100 dark:border-slate-800"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Markdown 文本渲染组件
 * 
 * 核心逻辑：
 * 1. 扩展语法：支持从文本中提取文件预览元数据并展示为文件卡片。
 * 2. 插件集成：
 *    - remark-math & rehype-katex: 处理 LaTeX 数学公式渲染。
 *    - remark-gfm: 支持 GitHub 风格的 Markdown（表格、任务列表等）。
 *    - remark-breaks: 将换行符转换为 HTML 换行。
 * 3. 代码高亮：使用 SyntaxHighlighter 对标准代码块进行着色，对 mermaid 代码块调用 Mermaid 组件。
 * 4. 样式控制：根据发送者（用户/助手）和当前主题动态切换排版样式。
 */
function MarkdownText({ content, isUser }: { content: string; isUser?: boolean }) {
  const [metadata, contentToRender] = extractMetadata(content);
  const [isExpanded, setIsExpanded] = useState(false);
  const isDark = useIsDark();

  // 自定义 Markdown 元素渲染逻辑
  const markdownComponents = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      // Mermaid 流程图特殊处理
      if (!inline && (language === 'mermaid' || language === 'sequenceDiagram')) {
        return <Mermaid chart={String(children).replace(/\n$/, '')} />;
      }

      // 标准代码块高亮
      return !inline && match ? (
        <SyntaxHighlighter
          {...props}
          style={isDark ? vscDarkPlus : prism}
          language={language}
          PreTag="div"
          className="rounded-md !my-2 max-w-full overflow-x-auto"
          wrapLongLines={true}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        // 行内代码
        <code {...props} className={`${className} bg-slate-200 dark:bg-slate-700 rounded px-1 py-0.5 text-inherit`}>
          {children}
        </code>
      );
    },
    // 自定义图片、表格渲染
    img: ({ node, ...props }: any) => <AsyncImage {...props} className="max-w-full h-auto rounded-lg" />,
    table: ({ node, ...props }: any) => <div className="overflow-x-auto my-4"><table {...props} className="min-w-full divide-y divide-slate-300 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 table-auto" /></div>,
    th: ({ node, ...props }: any) => <th {...props} className="px-3 py-2 text-left text-sm font-semibold text-inherit border border-slate-200 dark:border-slate-700 whitespace-nowrap" />,
    td: ({ node, ...props }: any) => <td {...props} className="px-3 py-2 text-sm text-inherit border border-slate-200 dark:border-slate-700" />,
  };

  // 如果包含文件元数据，渲染为可展开的文件预览卡片
  if (metadata) {
    let Icon = FileText;
    if (metadata.type === 'xlsx' || metadata.type === 'xls') Icon = FileSpreadsheet;
    if (['js', 'ts', 'tsx', 'html', 'css', 'py', 'json'].includes(metadata.type)) Icon = FileCode;

    return (
      <div className="my-2 select-none">
        <div
          className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border dark:border-slate-700 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="p-2 bg-white dark:bg-slate-900 rounded border dark:border-slate-700">
            <Icon size={24} className="text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{metadata.name}</div>
            <div className="text-xs text-slate-500">{metadata.size} • 点击{isExpanded ? '收起' : '查看内容'}</div>

          </div>
          {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
        </div>
        {isExpanded && (
          <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border dark:border-slate-800 text-sm overflow-x-auto select-text">
            <div className="prose dark:prose-invert max-w-none break-words">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm, remarkBreaks]}
                rehypePlugins={[[rehypeKatex, { strict: false }]]}
                components={markdownComponents}
                urlTransform={(url) => {
                  if (url.startsWith('attachment:')) return url;
                  return url;
                }}
              >
                {contentToRender}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 默认文本渲染逻辑
  const userProseClass = isDark
    ? "prose max-w-none break-words"
    : "prose prose-invert max-w-none break-words";

  const assistantProseClass = "prose dark:prose-invert max-w-none break-words";

  const proseClass = isUser ? userProseClass : assistantProseClass;

  return (
    <div className={proseClass}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeKatex, { strict: false }]]}
        components={markdownComponents}
        urlTransform={(url) => {
          if (url.startsWith('attachment:')) return url;
          return url;
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
