import { useState, useEffect, useRef, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
// 按需注册高频语言，避免全量 Prism 打包所有语言（显著减小 bundle 与单代码块渲染成本）
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';

SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('markup', markup);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('xml', markup);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);

import 'katex/dist/katex.min.css';
import { MessageContentPart, ToolCall } from '@/services/ai';
import { FileText, FileSpreadsheet, FileCode, FileJson, ChevronDown, ChevronRight, CheckCircle2, Loader2, GitCompare, Eye, Code2, XCircle, Brain } from 'lucide-react';
import { db } from '@/db';
import { useTheme } from '@/hooks/useTheme';
import { parseAIJson, AI_ONLY_HINT_PREFIX } from '@/lib/utils';
import type { SubAgentState } from '@/hooks/useChatSession';
import { reloadOnChunkError } from '@/lib/chunkLoadError';
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

/**
 * 视口内才挂载子树：用于包裹 Mermaid / 代码块 / HTML 预览等重组件，
 * 避免大笔记/题库一次性渲染所有重内容导致挂载与主题切换卡顿。
 * 进入视口后保持挂载（once），不再卸载，避免来回滚动反复重建。
 */
function useInViewportOnce() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setInView(true); io.disconnect(); break; }
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);
  return { ref, inView };
}

/** 懒挂载包装：视口外渲染轻量占位，进入视口后才渲染真实 children */
function LazyMount({ placeholderHeight = 80, className = '', children }: { placeholderHeight?: number; className?: string; children: React.ReactNode }) {
  const { ref, inView } = useInViewportOnce();
  if (inView) return <>{children}</>;
  return <div ref={ref} style={{ minHeight: placeholderHeight }} className={`rounded-md bg-zinc-50 dark:bg-zinc-900/30 ${className}`} />;
}

/** Mermaid 渲染结果缓存：以「主题 + 图源」为双键，命中则直接复用 svg，避免主题切换时同步重算 */
const mermaidSvgCache = new Map<string, string>();

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
  'web_search': '联网搜索',
  'read_url': '读取网页',
  'search_wikipedia': '维基百科',
  'search_wikipedia_web': '维基百科(站内搜)',
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
      case 'web_search': return `联网搜索: "${parsed.query || ''}"`;
      case 'read_url': return `读取网页: ${(parsed.url || '').replace(/^https?:\/\//, '').slice(0, 40)}`;
      case 'search_wikipedia': return `维基百科: "${parsed.query || ''}"`;
      case 'search_wikipedia_web': return `维基百科(站内搜): "${parsed.query || ''}"`;
      case 'present_plan': return `规划方案已准备就绪`;
      case 'start_execution': return `正在初始化执行环境`;
      default: return `${TOOL_NAMES[name] || name}`;
    }
  } catch (e) {
    return `${TOOL_NAMES[name] || name}`;
  }
};

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
 * 从工具执行结果中提取可读摘要信息
 */
function getToolResultSummary(name: string, result: string): string {
  if (!result) return '';
  try {
    const parsed = JSON.parse(result);
    switch (name) {
      case 'get_subjects': {
        const count = Array.isArray(parsed) ? parsed.length : 0;
        return `${count} 个科目`;
      }
      case 'get_subject_details': {
        const count = Array.isArray(parsed) ? parsed.length : 0;
        return `${count} 个实体`;
      }
      case 'get_entity_content': {
        const content = typeof parsed.content === 'string' ? parsed.content : '';
        const lines = content ? content.split('\n').length : 0;
        return lines > 0 ? `${lines} 行` : '';
      }
      case 'get_note_lines': {
        const lines = parsed.total_lines || 0;
        const start = parsed.start_line || 0;
        const end = parsed.end_line || lines;
        return `${start}~${end} 行 / 共 ${lines} 行`;
      }
      case 'get_quiz_questions': {
        const total = parsed.total_questions || 0;
        return `${total} 道题`;
      }
      case 'web_search': {
        if (parsed.error) return '失败';
        const count = parsed.count || (Array.isArray(parsed.results) ? parsed.results.length : 0);
        return `${count} 条结果`;
      }
      case 'read_url': {
        if (parsed.error) return '失败';
        return parsed.truncated ? `${parsed.chars || 0} 字 (已截断)` : `${parsed.chars || 0} 字`;
      }
      case 'search_wikipedia': {
        if (parsed.error) return '失败';
        return `${parsed.count || 0} 条`;
      }
      case 'search_wikipedia_web': {
        if (parsed.error) return '失败';
        return `${parsed.count || 0} 条`;
      }
      case 'create_mindmap':
      case 'create_taskboard':
      case 'create_note':
      case 'create_quiz':
        return parsed.merged ? '已合并' : '已创建';
      case 'patch_note_content':
        return '已修改';
      case 'patch_quiz_questions': {
        const a = parsed.added || 0, u = parsed.updated || 0, d = parsed.deleted || 0;
        return `+${a} ~${u} -${d}`;
      }
      case 'create_subject':
        return parsed.name || '已创建';
      default:
        return '';
    }
  } catch {
    return '';
  }
}

/**
 * 将子任务文本中的实体 ID / UUID 替换为对应实体名（查 db），避免出现长 UUID 噪音。
 * 处理三类形态：①整段括注「（实体ID: <uuid>）」直接删除②「键: <uuid>」标记 → 实体名③其余裸 UUID（如「为学科 <uuid> 创建」）→ 实体名。
 * nameMap 由组件异步解析后回填；解析前 nameMap 为空，未命中的 UUID 先删除并收敛空白，命中后回填为「`name`」。
 */
const UUID_PAT = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const ID_KEY = '(?:实体ID|entityId|subjectId|noteId|quizId|mindmapId|taskboardId)';
const RE_PAREN_ID = new RegExp(`[（(]\\s*${ID_KEY}\\s*[:：]?\\s*(${UUID_PAT})\\s*[)）]`, 'gi');
const RE_KEY_UUID = new RegExp(`\\s*${ID_KEY}\\s*[:：]?\\s*(${UUID_PAT})`, 'gi');
const RE_BARE_UUID = new RegExp(`(${UUID_PAT})`, 'gi');
const RE_UUID_EXTRACT = new RegExp(UUID_PAT, 'gi');
const RE_WS = /[ \t]{2,}/g;
const RE_PUNCT = /[ \t]+([，。、；！？])/g;

/** 按 UUID 查实体名：先查学科表（name），再查统一实体表（title：笔记/测验/导图/任务板） */
async function resolveEntityName(uuid: string): Promise<string | null> {
  try {
    const subject = await db.subjects.get(uuid);
    if (subject?.name) return subject.name;
    const entity = await db.entities.get(uuid);
    if (entity?.title) return entity.title;
  } catch { /* 查询失败静默 */ }
  return null;
}

/** 提取文本中所有 UUID（去重） */
function extractUuids(text: string): string[] {
  return Array.from(new Set(text.match(RE_UUID_EXTRACT) || []));
}

/** 用 nameMap 将文本中的 UUID 渲染为实体名；未命中的删除并收敛空白 */
function renderIds(text: string, nameMap: Record<string, string>): string {
  if (!text) return text;
  return text
    .replace(RE_PAREN_ID, '')
    .replace(RE_KEY_UUID, (_m, uuid) => nameMap[uuid] ? `\`${nameMap[uuid]}\`` : '')
    .replace(RE_BARE_UUID, (_m, uuid) => nameMap[uuid] ? `\`${nameMap[uuid]}\`` : '')
    .replace(RE_WS, ' ')
    .replace(RE_PUNCT, '$1')
    .trim();
}

/**
 * 子任务（delegate_task）卡片：展示子 Agent 的实时状态与内部工具调用列表。
 * 「分配的任务」默认收缩，点击展开后才显示完整任务文本；不展示上下文与子 Agent 流式输出。
 */
function SubAgentCard({ tc, state, summary }: {
  tc: ToolCall;
  state?: SubAgentState;
  summary?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // 「分配的任务」详情默认收缩，用户点击展开后才显示完整任务
  const [taskExpanded, setTaskExpanded] = useState(false);
  // UUID → 实体名 映射，异步从 db 解析后回填，用于把任务/摘要里的 UUID 渲染为实体名
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const resolvedRef = useRef<Set<string>>(new Set());
  // 完成态判定：优先看子 Agent 内存状态；若无状态但已有结果摘要（tool 消息已回传/已落库），
  // 也视为完成。修复：主 Agent 收尾（如新会话触发 onSessionChange 导致 Hook 重载）后
  // subAgentStates 可能丢失，但 delegate 的 tool 消息已持久化，据此仍应显示完成（打勾）而非转圈。
  const done = !!state?.done || !!summary;
  const failed = !!state?.error;
  const status = state?.status || (summary ? '已完成' : '等待中…');
  const subTools = state?.toolCalls || [];

  // 仅解析分配的任务（上下文不再展示，故不解析）
  let taskFull = '';
  try {
    const a = JSON.parse(tc.function.arguments || '{}');
    taskFull = String(a.task || '');
  } catch { /* 参数非标准 JSON 时静默 */ }
  // 展示用：把任务文本中的实体 ID / UUID 替换为实体名（nameMap 异步解析前先删除，命中后回填为「`name`」）
  const taskDisplay = renderIds(taskFull, nameMap);
  const taskPreview = taskDisplay.slice(0, 50);

  // 异步解析任务/摘要中出现的 UUID → 实体名，命中后回填 nameMap 触发重渲染
  useEffect(() => {
    const uuids = extractUuids(`${taskFull}\n${summary || ''}`);
    const missing = uuids.filter(u => !resolvedRef.current.has(u));
    if (missing.length === 0) return;
    missing.forEach(u => resolvedRef.current.add(u));
    let cancelled = false;
    Promise.all(missing.map(async u => [u, await resolveEntityName(u)] as const)).then(entries => {
      if (cancelled) return;
      const added: Record<string, string> = {};
      for (const [u, name] of entries) if (name) added[u] = name;
      if (Object.keys(added).length) setNameMap(prev => ({ ...prev, ...added }));
    });
    return () => { cancelled = true; };
  }, [taskFull, summary]);

  return (
    <div className="flex flex-col my-1 text-[11px] animate-in fade-in slide-in-from-left-1 duration-200">
      <div
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded px-0.5 -mx-0.5 py-0.5 select-none"
        title="点击查看子任务过程"
      >
        {done
          ? (failed
            ? <XCircle size={12} className="text-red-500 dark:text-red-400 shrink-0" />
            : <CheckCircle2 size={12} className="text-green-500 dark:text-green-400 shrink-0" />)
          : <Loader2 size={12} className="animate-spin text-blue-500 shrink-0" />}
        <span className="font-medium text-zinc-400 dark:text-zinc-500 whitespace-nowrap">子任务</span>
        <span className="text-zinc-300 dark:text-zinc-600 select-none">·</span>
        <span className="text-zinc-500 dark:text-zinc-400 truncate flex-1 min-w-0">
          {taskPreview || status}
        </span>
        {!done && taskPreview && (
          <span className="text-zinc-400 dark:text-zinc-500 truncate">{status}</span>
        )}
        <span className="text-zinc-400 transition-transform shrink-0 ml-0.5" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>
          <ChevronRight size={13} />
        </span>
      </div>
      {expanded && (
        <div className="mt-1 ml-4 space-y-1.5 border-l border-zinc-200 dark:border-zinc-700 pl-2">
          {/* 分配的任务：默认收缩，展开后才显示完整任务文本 */}
          <div className="space-y-0.5">
            <div
              onClick={() => setTaskExpanded(v => !v)}
              className="text-[10px] text-zinc-400 flex items-center gap-1 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none"
            >
              <span className="transition-transform inline-block shrink-0" style={{ transform: taskExpanded ? 'rotate(90deg)' : 'none' }}>
                <ChevronRight size={10} />
              </span>
              <span>分配的任务</span>
              {taskDisplay.length > 50 && (
                <span className="text-zinc-300 dark:text-zinc-600 font-normal">{taskExpanded ? '收起' : '展开'}</span>
              )}
            </div>
            {taskExpanded && (
              <div className="text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-words">{taskDisplay || '（未提供任务描述）'}</div>
            )}
          </div>
          {subTools.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[10px] text-zinc-400">子工具调用（{subTools.length}）：</div>
              {subTools.map((t, i) => (
                <div key={i} className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  <CheckCircle2 size={10} className="text-green-500/70 shrink-0" />
                  <span className="font-medium text-zinc-400 dark:text-zinc-500 whitespace-nowrap">{TOOL_NAMES[t.name] || t.name}</span>
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  <span className="truncate">{getToolDescription(t.name, t.args)}</span>
                </div>
              ))}
            </div>
          )}
          {done && summary && (
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
              <span className="text-zinc-400">摘要：</span>{renderIds(summary, nameMap)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 思考过程展示组件（reasoning_content）。
 * 折叠态显示「思考中 Xs」（进行中，转圈计时）或「已思考 Xs」（已完成）；
 * 展开后渲染模型的推理内容。进行中以挂载时刻为起点实时计时，
 * 完成后由 durationMs 给出精确耗时。
 */
export function ThinkingBlock({ content, durationMs, active }: {
  content: string;
  durationMs?: number;
  active: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [liveMs, setLiveMs] = useState(0);

  // 进行中：以挂载时刻为起点实时计时；结束后清除定时器，改用精确的 durationMs
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const id = setInterval(() => setLiveMs(Date.now() - start), 200);
    return () => clearInterval(id);
  }, [active]);

  const seconds = durationMs != null
    ? Math.floor(durationMs / 1000)
    : active
      ? Math.floor(liveMs / 1000)
      : null;

  const label = active
    ? (seconds ? `思考中 ${seconds}s` : '思考中…')
    : (seconds != null ? `已思考 ${seconds}s` : '思考过程');

  return (
    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 my-0.5 select-none">
      <button
        onClick={() => setExpanded(v => !v)}
        className="inline-flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 rounded px-1.5 py-1 -mx-1.5 transition-colors"
      >
        {active
          ? <Loader2 size={12} className="animate-spin text-blue-500 shrink-0" />
          : <Brain size={12} className="text-zinc-400 dark:text-zinc-500 shrink-0" />}
        <span className="font-medium">{label}</span>
        <span className="text-zinc-400 transition-transform shrink-0" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>
          <ChevronRight size={13} />
        </span>
      </button>
      {expanded && (
        <div className="mt-1.5 ml-3 pl-3 border-l border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 max-h-60 overflow-y-auto select-text" style={{ fontSize: 'var(--app-font-size, 13px)' }}>
          <MessageRenderer content={content} isUser={false} />
        </div>
      )}
    </div>
  );
}

/**
 * 工具调用渲染组件
 * 以紧凑内联方式展示 AI 执行的工具操作，点击 > 可展开详情
 */
export function ToolCallRenderer({ toolCalls, results = {}, subAgentStates }: { toolCalls: ToolCall[], results?: Record<string, string>, subAgentStates?: Record<string, SubAgentState> }) {
  const [selectedToolCall, setSelectedToolCall] = useState<ToolCall | null>(null);
  const [modalTab, setModalTab] = useState<'content' | 'diff' | 'result'>('content');
  const isDark = useIsDark();

  useEffect(() => {
    if (selectedToolCall) {
      setModalTab(getResultDiff(selectedToolCall.id) ? 'diff' : 'content');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedToolCall]);

  /** 所有已完成的工具调用均可展开查看详情 */
  const isExpandable = (tcId: string) => !!results[tcId];

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
    <div className="flex flex-col gap-1 my-1">
      {toolCalls.map((tc, idx) => {
        const result = results[tc.id];
        const isComplete = !!result;
        const canExpand = isExpandable(tc.id);
        const resultSummary = isComplete ? getToolResultSummary(tc.function.name, result) : '';

        // delegate_task 渲染为子任务卡片（实时状态 + 折叠流式 + 子工具列表 + 完成摘要）
        if (tc.function.name === 'delegate_task') {
          return <SubAgentCard key={tc.id || idx} tc={tc} state={subAgentStates?.[tc.id]} summary={result} />;
        }

        return (
          <div
            key={tc.id || idx}
            onClick={canExpand ? () => setSelectedToolCall(tc) : undefined}
            className={`flex items-center gap-1.5 text-[11px] animate-in fade-in slide-in-from-left-1 duration-200 ${canExpand ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded px-0.5 -mx-0.5 py-0.5 -my-0.5 transition-colors' : 'group'}`}
            title={canExpand ? '点击查看详情' : undefined}
          >
            {isComplete
              ? <CheckCircle2 size={12} className="text-green-500 dark:text-green-400 shrink-0" />
              : <Loader2 size={12} className="animate-spin text-blue-500 shrink-0" />
            }
            <span className="font-medium text-zinc-400 dark:text-zinc-500 whitespace-nowrap select-none">
              {TOOL_NAMES[tc.function.name] || tc.function.name}
            </span>
            <span className="text-zinc-300 dark:text-zinc-600 select-none">·</span>
            <span className="text-zinc-400 dark:text-zinc-500 truncate">
              {getToolDescription(tc.function.name, tc.function.arguments)}
              {resultSummary && (
                <span className="text-zinc-400/60 dark:text-zinc-500/60"> → {resultSummary}</span>
              )}
            </span>
            {canExpand && (
              <span className="text-zinc-400 transition-colors shrink-0 ml-0.5 opacity-60">
                <ChevronRight size={13} />
              </span>
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
          const rawResult = results[selectedToolCall.id];
          let resultParsed: any = null;
          if (rawResult) {
            try { resultParsed = JSON.parse(rawResult); } catch {}
          }
          return (
            <div className="space-y-3">
              {/* 页签栏 */}
              <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {diff && (
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
                )}
                <button
                  onClick={() => setModalTab('content')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    modalTab === 'content' || !diff
                      ? 'bg-white dark:bg-zinc-800 shadow text-zinc-800 dark:text-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  请求参数
                </button>
                {rawResult && (
                  <button
                    onClick={() => setModalTab('result')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      modalTab === 'result'
                        ? 'bg-white dark:bg-zinc-800 shadow text-zinc-800 dark:text-zinc-200'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    返回结果
                  </button>
                )}
              </div>

              {/* Diff 视图 */}
              {diff && modalTab === 'diff' && (
                <DiffViewer before={diff.before} after={diff.after} />
              )}

              {/* 请求参数视图 */}
              {modalTab === 'content' && (
                <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 p-1 bg-white dark:bg-zinc-950">
                  {(() => {
                    try {
                      const args = JSON.parse(selectedToolCall.function.arguments);
                      if (selectedToolCall.function.name === 'present_plan') {
                        return (
                          <div className="p-4 prose prose-sm dark:prose-invert max-w-none max-h-[60vh] overflow-y-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                              {args.plan_summary || '暂无详细规划内容'}
                            </ReactMarkdown>
                          </div>
                        );
                      }
                      return (
                        <SyntaxHighlighter
                          style={isDark ? vscDarkPlus : prism}
                          language="json"
                          PreTag="div"
                          className="!m-0 max-h-[60vh] overflow-y-auto text-xs"
                          wrapLongLines={true}
                        >
                          {JSON.stringify(args, null, 2)}
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

              {/* 返回结果视图 */}
              {modalTab === 'result' && rawResult && (
                <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 p-1 bg-white dark:bg-zinc-950">
                  {(() => {
                    try {
                      const formatted = JSON.stringify(resultParsed, null, 2);
                      // 如果结果包含长文本内容，直接渲染 Markdown
                      if (resultParsed?.content && typeof resultParsed.content === 'string' && resultParsed.content.length > 200) {
                        return (
                          <div className="p-4 max-h-[60vh] overflow-y-auto">
                            <div className="text-[10px] text-zinc-400 mb-2">内容预览：</div>
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                {resultParsed.content.slice(0, 3000) + (resultParsed.content.length > 3000 ? '\n\n…(内容过长已截断)' : '')}
                              </ReactMarkdown>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <SyntaxHighlighter
                          style={isDark ? vscDarkPlus : prism}
                          language="json"
                          PreTag="div"
                          className="!m-0 max-h-[60vh] overflow-y-auto text-xs"
                          wrapLongLines={true}
                        >
                          {formatted}
                        </SyntaxHighlighter>
                      );
                    } catch {
                      return (
                        <div className="p-4 font-mono text-xs whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
                          {rawResult}
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
 * 宽松检测：内容是否包含任何 HTML 标签（用于决定是否显示 View/Code 切换按钮）
 */
export function hasHtmlContent(content: string): boolean {
  if (!content || !content.trim()) return false;
  return /<[a-zA-Z][^>]*>/.test(content);
}

/**
 * 严格检测：内容是否为纯 HTML 文档（用于决定是否用 iframe 预览整篇笔记）。
 *
 * 注意：含 markdown 代码围栏（```）的内容一律按 markdown 渲染——其内嵌的
 * ```html / ```mermaid 等代码块会由 MarkdownText 的代码块渲染器单独处理为
 * 内嵌预览。若不排除，```html 代码块里的 HTML 标签会把整篇 markdown 误判为
 * HTML 文档，导致 markdown 部分被塞进 iframe 而错误展示。纯 HTML 文档不会使用 ``` 围栏。
 */
export function isHtmlContent(content: string): boolean {
  if (!content || !content.trim()) return false;
  const trimmed = content.trim();
  // 含 markdown 代码围栏 → 是 markdown（内嵌了 html/mermaid 等代码块），不是纯 HTML 文档
  if (/```/.test(trimmed)) return false;
  // 以 DOCTYPE、html 标签、或 div/table/style/script 等结构标签开头
  if (/^\s*<(!DOCTYPE|html|head|body|div|table|style|script|meta|link|iframe)[\s>]/i.test(trimmed)) return true;
  // 或内容中 HTML 标签占比显著（>30% 的行含 HTML 标签）
  const lines = trimmed.split('\n');
  if (lines.length > 2) {
    const htmlLines = lines.filter(l => /<[a-zA-Z][^>]*>/.test(l));
    return htmlLines.length / lines.length > 0.3;
  }
  return false;
}

/**
 * View/Code 切换按钮组件（紧凑版，用于代码块内嵌）
 */
function MiniViewToggle({ mode, onChange }: { mode: 'view' | 'code'; onChange: (m: 'view' | 'code') => void }) {
  return (
    <div className="inline-flex items-center rounded overflow-hidden border border-zinc-300 dark:border-zinc-600">
      <button
        onClick={() => onChange('view')}
        className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
          mode === 'view' ? 'bg-blue-600 text-white' : 'bg-transparent text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
      >
        <Eye size={10} /> 预览
      </button>
      <button
        onClick={() => onChange('code')}
        className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
          mode === 'code' ? 'bg-blue-600 text-white' : 'bg-transparent text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
      >
        <Code2 size={10} /> 源码
      </button>
    </div>
  );
}

/** View/Code 切换按钮（标准大小，用于工具栏） */
export function ViewCodeToggle({ mode, onChange, className = '' }: { mode: 'view' | 'code'; onChange: (m: 'view' | 'code') => void; className?: string }) {
  return (
    <div className={`inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden ${className}`}>
      <button onClick={() => onChange('view')}
        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
          mode === 'view' ? 'bg-blue-600 text-white' : 'bg-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`} title="预览视图">
        <Eye size={12} /> 预览
      </button>
      <button onClick={() => onChange('code')}
        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
          mode === 'code' ? 'bg-blue-600 text-white' : 'bg-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`} title="源代码视图">
        <Code2 size={12} /> 源码
      </button>
    </div>
  );
}

/**
 * HTML 预览组件：view 模式用 iframe 渲染可交互 HTML，code 模式用 SyntaxHighlighter 展示源码
 */
/** 将用户 HTML 包装为安全的 iframe srcdoc：注入防溢出样式，防止错误文本撑开布局 */
function wrapHtmlForIframe(html: string): string {
  const overflowCSS = `<style>
*,*::before,*::after{max-width:100%!important;overflow-wrap:break-word!important;word-break:break-word!important;box-sizing:border-box!important}
pre,code{white-space:pre-wrap!important;overflow-wrap:break-word!important;word-break:break-all!important;max-width:100%!important;display:block!important}
img,svg,canvas,video,iframe,object{max-width:100%!important;height:auto!important}
table{max-width:100%!important;display:block!important;overflow-x:auto!important}
body{margin:0;padding:8px;font-family:system-ui,sans-serif;font-size:14px;max-width:100%!important;overflow-x:hidden!important}
</style>`;
  // iframe 仅开放 allow-scripts（不透明源），父页面无法读取 contentDocument，
  // 故注入脚本主动通过 postMessage 上报内容高度，供父组件按需调整 iframe 高度
  const heightReportScript = `<script>(function () {
  function report() {
    var b = document.body, de = document.documentElement;
    var h = Math.max((de && de.scrollHeight) || 0, (b && b.scrollHeight) || 0, 200);
    try { parent.postMessage({ __htmlPreviewHeight: h }, '*'); } catch (e) {}
  }
  function schedule() { report(); setTimeout(report, 60); setTimeout(report, 400); }
  if (document.readyState === 'complete') { schedule(); }
  else { window.addEventListener('load', schedule); document.addEventListener('DOMContentLoaded', report); }
  window.addEventListener('resize', report);
  if (window.ResizeObserver && document.body) {
    try { new ResizeObserver(report).observe(document.body); } catch (e) {}
  }
})();</script>`;
  const headInject = overflowCSS + heightReportScript;
  const trimmed = html.trim();
  // 已有完整 HTML 结构：注入到 head 中
  if (/^\s*<(!DOCTYPE|html)/i.test(trimmed)) {
    if (/<head[^>]*>/i.test(trimmed)) {
      return trimmed.replace(/<head[^>]*>/i, (match) => match + headInject);
    }
    if (/<html[^>]*>/i.test(trimmed)) {
      return trimmed.replace(/<html[^>]*>/i, (match) => match + '<head>' + headInject + '</head>');
    }
    return headInject + trimmed;
  }
  // 片段 HTML：直接拼接
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' + headInject + '</head><body>' + trimmed + '</body></html>';
}

export function HtmlPreview({ content, mode, autoHeight = true, className = '' }: { content: string; mode: 'view' | 'code'; autoHeight?: boolean; className?: string }) {
  const isDark = useIsDark();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(300);

  const srcdoc = useMemo(() => (mode === 'view' ? wrapHtmlForIframe(content) : ''), [mode, content]);

  // autoHeight 模式：监听 iframe 内通过 postMessage 上报的内容高度
  // iframe 仅开放 allow-scripts（不透明源），父页面无法读取 contentDocument，
  // 故由 wrapHtmlForIframe 注入的脚本在 load / resize / ResizeObserver 时主动上报
  useEffect(() => {
    if (mode !== 'view' || !autoHeight || !iframeRef.current) return;
    const iframe = iframeRef.current;
    let mounted = true;
    const onMessage = (e: MessageEvent) => {
      if (!mounted) return;
      // 仅处理来自当前 iframe 的消息，避免同页多个预览互相串扰
      if (e.source !== iframe.contentWindow) return;
      const data = e.data as { __htmlPreviewHeight?: number } | null;
      if (data && typeof data.__htmlPreviewHeight === 'number') {
        setMeasuredHeight(Math.max(data.__htmlPreviewHeight, 200));
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      mounted = false;
      window.removeEventListener('message', onMessage);
    };
  }, [mode, srcdoc, autoHeight]);

  if (mode === 'code') {
    return (
      <div className={`rounded-lg overflow-x-auto border border-zinc-200 dark:border-zinc-700 max-w-full ${className}`}>
        <SyntaxHighlighter
          style={isDark ? vscDarkPlus : prism}
          language="html"
          PreTag="div"
          className="!m-0 text-xs max-w-none"
          wrapLongLines={false}
          showLineNumbers={true}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    );
  }

  const iframeStyle: React.CSSProperties = autoHeight
    ? { height: measuredHeight, minHeight: 200 }
    : { flex: 1, minHeight: 200 };

  return (
    <div className={`rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white max-w-full flex flex-col ${className}`} style={autoHeight ? { paddingBottom: 4 } : undefined}>
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        className="w-full border-0"
        style={iframeStyle}
        title="HTML Preview"
      />
    </div>
  );
}

/**
 * 消息渲染主组件
 *
 * 核心功能：
 * 1. 结构化处理：支持纯文本字符串或多模态内容数组。
 * 2. Markdown 解析：集成 ReactMarkdown 实现基础格式渲染，支持内嵌 HTML。
 * 3. 复杂逻辑分发：根据内容类型（文字、图片等）调用对应的子组件。
 * 4. 支持 view/code 双模式切换。
 */
export function MessageRenderer({ content, isUser }: MessageRendererProps) {
  if (!content) return null;

  if (Array.isArray(content)) {
    return (
      <div className="space-y-2">
        {content.map((part, i) => {
          if (part.type === 'text') {
            // 仅供 AI 阅读的隐藏提示（如 attachment id 说明）——随消息发给模型，但不在 UI 中显示
            if (part.text.startsWith(AI_ONLY_HINT_PREFIX)) return null;
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
 * 文件类型 → 预览卡片样式映射（图标 + 主题色调）
 * 为每种受支持的文件格式提供可区分的预览卡片样式；未列出的格式回退到默认文本样式。
 * metadata.type 即文件扩展名（见 fileProcessor.ts）。
 */
const FILE_TYPE_STYLES: Record<string, { Icon: any; tone: 'blue' | 'green' | 'violet' | 'amber' | 'red' | 'orange' }> = {
  // PDF
  pdf: { Icon: FileText, tone: 'red' },
  // PowerPoint
  pptx: { Icon: FileText, tone: 'orange' },
  // 文档 / 纯文本 / Markdown
  docx: { Icon: FileText, tone: 'blue' },
  txt: { Icon: FileText, tone: 'blue' },
  md: { Icon: FileText, tone: 'blue' },
  // 表格 / 数据
  xlsx: { Icon: FileSpreadsheet, tone: 'green' },
  xls: { Icon: FileSpreadsheet, tone: 'green' },
  csv: { Icon: FileSpreadsheet, tone: 'green' },
  // JSON 数据
  json: { Icon: FileJson, tone: 'amber' },
  // 代码
  js: { Icon: FileCode, tone: 'violet' },
  ts: { Icon: FileCode, tone: 'violet' },
  tsx: { Icon: FileCode, tone: 'violet' },
  css: { Icon: FileCode, tone: 'violet' },
  py: { Icon: FileCode, tone: 'violet' },
  html: { Icon: FileCode, tone: 'violet' },
};

/**
 * 主题色调 → 具体 Tailwind 类（图标颜色 + 图标底色）。
 * 类名以完整字面量出现，确保 Tailwind JIT 能采集到，不会被 PurgeCSS 移除。
 */
const TONE_CLASSES: Record<'blue' | 'green' | 'violet' | 'amber' | 'red' | 'orange', { color: string; bg: string }> = {
  blue: { color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  green: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30' },
  violet: { color: 'text-violet-500 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  amber: { color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  red: { color: 'text-red-500 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  orange: { color: 'text-orange-500 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/30' },
};

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
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isDark = useIsDark();
  const cacheKey = `${isDark ? 'd' : 'l'}::${chart}`;

  useEffect(() => {
    let mounted = true;
    let cancelled = false;

    // 命中缓存：直接复用 svg，跳过加载与渲染（主题切换时的关键优化）
    const cached = mermaidSvgCache.get(cacheKey);
    if (cached) {
      setSvg(cached);
      setError(null);
      return;
    }
    if (!chart) return;

    // mermaid 按需动态加载，避免其核心代码进入首屏主 bundle
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        if (cancelled) return;
        mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default', securityLevel: 'loose' });
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        if (mounted && !cancelled) {
          mermaidSvgCache.set(cacheKey, svg);
          setSvg(svg);
          setError(null);
        }
      } catch (e: any) {
        // mermaid 11 懒加载图表模块（如 ganttDiagram-xxxx.js），重新部署后旧哈希 chunk
        // 失效或缓存损坏时会触发动态 import 失败——此时带缓存破坏参数刷新一次即可恢复
        if (reloadOnChunkError(e)) return;
        console.error("Mermaid Render Fail", e);
        if (mounted && !cancelled) {
          setError(e.message || "Invalid Diagram");
        }
      }
    })();

    return () => { mounted = false; cancelled = true; };
  }, [chart, isDark, cacheKey]);

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
/** HTML 代码块渲染组件：支持预览 / 源码切换 */
function HtmlCodeBlock({ code }: { code: string }) {
  const [mode, setMode] = useState<'view' | 'code'>('view');
  const isDark = useIsDark();

  if (mode === 'code') {
    return (
      <div className="my-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-zinc-400 font-mono">html</span>
          <MiniViewToggle mode={mode} onChange={setMode} />
        </div>
        <div className="rounded-lg overflow-x-auto border border-zinc-200 dark:border-zinc-700 max-w-full">
          <SyntaxHighlighter
            style={isDark ? vscDarkPlus : prism}
            language="html"
            PreTag="div"
            className="!m-0 text-xs max-w-none"
            wrapLongLines={false}
            showLineNumbers={true}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-400 font-mono">html</span>
        <MiniViewToggle mode={mode} onChange={setMode} />
      </div>
      <HtmlPreview content={code} mode="view" />
    </div>
  );
}

const MarkdownText = memo(function MarkdownText({ content, isUser }: { content: string; isUser?: boolean }) {
  const [metadata, contentToRender] = extractMetadata(content);
  const [isExpanded, setIsExpanded] = useState(false);
  const isDark = useIsDark();

  // 自定义 Markdown 元素渲染逻辑（仅随主题变化重建，避免每次渲染全树重算）
  const markdownComponents = useMemo(() => ({
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      // Mermaid 流程图特殊处理（懒挂载：视口外不渲染，避免一次性渲染所有图）
      if (!inline && (language === 'mermaid' || language === 'sequenceDiagram')) {
        return <LazyMount placeholderHeight={300}><Mermaid chart={String(children).replace(/\n$/, '')} /></LazyMount>;
      }

      // HTML 代码块：支持预览 / 源码切换（懒挂载）
      if (!inline && language === 'html') {
        return <LazyMount placeholderHeight={300}><HtmlCodeBlock code={String(children).replace(/\n$/, '')} /></LazyMount>;
      }

      // 标准代码块高亮（懒挂载，避免视口外代码块提前 tokenize）
      return !inline && match ? (
        <LazyMount placeholderHeight={120}>
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
        </LazyMount>
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
    th: ({ node, ...props }: any) => <th {...props} className="px-3 py-2 text-left font-semibold text-inherit border border-slate-200 dark:border-slate-700 whitespace-nowrap" style={{ fontSize: 'inherit' }} />,
    td: ({ node, ...props }: any) => <td {...props} className="px-3 py-2 text-inherit border border-slate-200 dark:border-slate-700" style={{ fontSize: 'inherit' }} />,
  }), [isDark]);

  // 始终包含 rehypeRaw，用于渲染内嵌 HTML（callout boxes、colored text 等）
  const rehypePlugins = useMemo(() => [rehypeRaw, [rehypeKatex, { strict: false }]] as any, []);

  // 如果包含文件元数据，渲染为可展开的文件预览卡片
  if (metadata) {
    const fileStyle = FILE_TYPE_STYLES[metadata.type as string] ?? { Icon: FileText, tone: 'blue' as const };
    const Icon = fileStyle.Icon;
    const toneClass = TONE_CLASSES[fileStyle.tone] ?? TONE_CLASSES.blue;

    return (
      <div className="my-2 select-none">
        <div
          className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border dark:border-slate-700 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className={`p-2 rounded border border-slate-200 dark:border-slate-700 ${toneClass.bg}`}>
            <Icon size={24} className={toneClass.color} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{metadata.name}</div>
            <div className="text-xs text-slate-500">{metadata.size} • 点击{isExpanded ? '收起' : '查看内容'}</div>

          </div>
          {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
        </div>
        {isExpanded && (
          <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border dark:border-slate-800 text-xs overflow-x-auto select-text">
            <div className="prose dark:prose-invert max-w-none break-words">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm, remarkBreaks]}
                rehypePlugins={rehypePlugins}
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
    ? "prose prose-sm max-w-none break-words"
    : "prose prose-sm prose-invert max-w-none break-words";

  const assistantProseClass = "prose prose-sm dark:prose-invert max-w-none break-words";

  const proseClass = isUser ? userProseClass : assistantProseClass;

  return (
    <div className={proseClass} style={{ fontSize: 'var(--app-font-size, 14px)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm, remarkBreaks]}
        rehypePlugins={rehypePlugins}
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
});
