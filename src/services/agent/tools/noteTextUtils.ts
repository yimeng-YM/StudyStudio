import { ToolError } from './toolError';

/**
 * 笔记文本定位与匹配的纯函数工具集。
 *
 * 被 patch_note_content / insert_image_into_note / search_in_note /
 * delete_note_section 共用，统一行号体系（1-indexed、inclusive，与
 * get_note_lines / get_note_outline 对齐）与匹配语义。
 */

// ─── 行 / 列换算 ──────────────────────────────────────────────────────────────

/** 构建每行起始字符偏移表：offsets[i] 是第 (i+1) 行的起始偏移。length === 总行数。 */
export function buildLineOffsets(content: string): number[] {
  const offsets = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

export interface LineCol {
  /** 1-indexed 行号 */
  line: number;
  /** 1-indexed 列号 */
  column: number;
}

/** 二分查找：把全局字符偏移换算成 { line, column }（均 1-indexed）。 */
export function offsetToLineCol(offsets: number[], offset: number): LineCol {
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= offset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { line: ans + 1, column: offset - offsets[ans] + 1 };
}

/** 取第 line 行（1-indexed）的文本（不含行尾换行）。 */
export function lineText(content: string, offsets: number[], line: number): string {
  const start = offsets[line - 1];
  const end = line < offsets.length ? offsets[line] - 1 : content.length;
  return content.slice(start, end);
}

// ─── 行区间 ──────────────────────────────────────────────────────────────────

export interface LineRange {
  /** 1-indexed 起始行（含） */
  start: number;
  /** 1-indexed 结束行（含）；省略表示到末尾 */
  end?: number;
}

export interface ResolvedRange {
  start: number;
  end: number;
}

/** 把用户给的 line_range（可能越界/缺省）规范成有效的 [start, end] 闭区间。 */
export function resolveLineRange(range: LineRange | undefined, totalLines: number): ResolvedRange | null {
  if (!range) return null;
  const start = Math.max(1, Math.min(Math.floor(range.start) || 1, totalLines));
  const rawEnd = range.end !== undefined ? range.end : totalLines;
  const end = Math.max(start, Math.min(Math.floor(rawEnd) || totalLines, totalLines));
  return { start, end };
}

/**
 * 计算行区间对应的字符偏移闭区间 [regionStart, regionEnd)。
 * regionEnd 排除掉第 `end` 行末尾的换行符（若存在），使区间精确覆盖可见行内容。
 */
export function regionForRange(
  content: string,
  offsets: number[],
  range: ResolvedRange,
): { regionStart: number; regionEnd: number } {
  const regionStart = offsets[range.start - 1];
  const regionEnd = range.end < offsets.length ? offsets[range.end] - 1 : content.length;
  return { regionStart, regionEnd };
}

// ─── 匹配 ────────────────────────────────────────────────────────────────────

export interface Occurrence {
  /** 全局起始字符偏移（含） */
  start: number;
  /** 全局结束字符偏移（不含） */
  end: number;
  /** 起始行（1-indexed） */
  line: number;
  /** 起始列（1-indexed） */
  column: number;
  /** 命中所在行的上下文预览（已裁剪） */
  preview: string;
}

export interface FindOptions {
  /** 是否大小写敏感（默认 true，仅精确模式生效） */
  caseSensitive?: boolean;
  /** 是否把 needle 当作正则源（默认 false） */
  useRegex?: boolean;
  /** 正则额外 flags（如 'im'）；'g' 由内部强制补齐 */
  regexFlags?: string;
  /** 限定到某行区间内（仅返回完全落入区间的命中） */
  lineRange?: LineRange;
}

/** 转义正则元字符，用于把纯文本转成安全的字面量正则。 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 强制全局标志，避免 replace / 迭代只处理首个命中。 */
function ensureGlobal(flags: string): string {
  return flags.includes('g') ? flags : flags + 'g';
}

/** 把 search 源编译成正则；强制 'g'，语法错误时抛结构化 ToolError。 */
export function compileSearchRegex(source: string, flags = ''): RegExp {
  try {
    return new RegExp(source, ensureGlobal(flags));
  } catch (e: any) {
    throw new ToolError(
      'invalid_regex',
      `正则表达式无效：${e?.message || '语法错误'}`,
      { pattern: source, error: e?.message },
      '请检查正则语法（括号配对、量词、转义）后重试；如需匹配字面文本，请不要传 use_regex。',
    );
  }
}

const SAFETY_CAP = 10000;

/** 生成命中所在行的预览（过长则按命中位置取窗口）。 */
function buildPreview(content: string, offsets: number[], line: number, start: number): string {
  const lineStart = offsets[line - 1];
  const lineEnd = line < offsets.length ? offsets[line] - 1 : content.length;
  let text = content.slice(lineStart, lineEnd);
  if (text.length <= 200) return text;
  const rel = start - lineStart;
  const winStart = Math.max(0, rel - 40);
  const winEnd = Math.min(text.length, winStart + 160);
  return (winStart > 0 ? '…' : '') + text.slice(winStart, winEnd) + (winEnd < text.length ? '…' : '');
}

/**
 * 在 haystack 中查找 needle 的所有出现位置。
 *
 * - useRegex=false（默认）：字面子串匹配（大小写由 caseSensitive 控制，默认区分）。
 * - useRegex=true：把 needle 当作正则源，自动补 'g'，捕获组可在替换中用 $1/$2 引用。
 * - lineRange：仅返回完全落在 [start, end] 行区间内的命中。
 *
 * @throws {ToolError} 当 useRegex 且正则语法非法时（type='invalid_regex'）。
 */
export function findOccurrences(haystack: string, needle: string, opts: FindOptions = {}): Occurrence[] {
  const out: Occurrence[] = [];
  if (!needle) return out;

  const offsets = buildLineOffsets(haystack);
  const totalLines = offsets.length;
  const range = resolveLineRange(opts.lineRange, totalLines);
  const regionStart = range ? offsets[range.start - 1] : 0;
  const regionEnd = range ? (range.end < offsets.length ? offsets[range.end] - 1 : haystack.length) : haystack.length;

  const push = (start: number, end: number) => {
    if (start < regionStart || end > regionEnd) return; // 仅保留落入区间内的命中
    if (start < 0 || end > haystack.length || end <= start) return;
    const { line, column } = offsetToLineCol(offsets, start);
    out.push({ start, end, line, column, preview: buildPreview(haystack, offsets, line, start) });
  };

  let guard = 0;
  if (opts.useRegex) {
    const re = compileSearchRegex(needle, opts.regexFlags || '');
    re.lastIndex = regionStart;
    let m: RegExpExecArray | null;
    while ((m = re.exec(haystack)) !== null) {
      if (m[0].length === 0) {
        // 零宽匹配会原地踏步，强制前进一格
        re.lastIndex++;
        continue;
      }
      push(m.index, m.index + m[0].length);
      if (++guard > SAFETY_CAP) break;
    }
  } else if (opts.caseSensitive === false) {
    // 大小写不敏感的字面匹配：转义后用 'gi'
    const re = new RegExp(escapeRegExp(needle), 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(haystack)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      push(m.index, m.index + m[0].length);
      if (++guard > SAFETY_CAP) break;
    }
  } else {
    // 大小写敏感的字面匹配：直接 indexOf，最稳最快
    let from = regionStart;
    while (guard++ < SAFETY_CAP) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1 || idx >= regionEnd) break;
      push(idx, idx + needle.length);
      from = idx + needle.length;
    }
  }

  return out;
}

// ─── 最近似匹配（用于 not-found 诊断）────────────────────────────────────────

export interface FirstDiff {
  /** needle 中首个不一致字符的索引（0-based） */
  index: number;
  /** needle 在该位置的期望字符（可读化表示） */
  expected: string;
  /** 实际文本在该位置的字符（可读化表示） */
  actual: string;
}

export interface NearestMatch {
  /** 相似度 0–1 */
  similarity: number;
  /** 最接近的行（1-indexed） */
  line: number;
  /** 列（固定 1，仅作锚点） */
  column: number;
  /** 首个不一致字符信息；完全一致时为 null */
  firstDiff: FirstDiff | null;
  /** 最接近行的预览片段 */
  snippet: string;
}

/** 把控制/空白字符显示成可读形式。 */
function reprChar(ch: string | undefined): string {
  if (ch === undefined) return '(无)';
  if (ch === '\n') return '\\n';
  if (ch === '\r') return '\\r';
  if (ch === '\t') return '\\t';
  if (ch === ' ') return '(空格)';
  return ch;
}

/** 找出 a / b 的首个不一致字符；完全一致返回 null。 */
export function firstDiffChar(a: string, b: string): FirstDiff | null {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return { index: i, expected: reprChar(a[i]), actual: reprChar(b[i]) };
    }
  }
  if (a.length !== b.length) {
    return {
      index: n,
      expected: reprChar(a[n]),
      actual: reprChar(b[n]),
    };
  }
  return null;
}

/** 莱文斯坦距离（两行 DP）。仅用于短串（见 similarityRatio 的长度阈值）。 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/** 字符 bigram 的 Sørensen–Dice 系数（0–1）。用于超长串，避免莱文斯坦 O(n²) 爆炸。 */
function diceCoefficient(a: string, b: string): number {
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.size === 0 && gb.size === 0) return 1;
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const x of ga) if (gb.has(x)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

/** 相似度 0–1。超长串自动降级为 bigram Dice 系数以控制开销。 */
export function similarityRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  if (a.length > 300 || b.length > 300) return diceCoefficient(a, b);
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

/**
 * 启发式定位「最接近 needle」的位置，用于 not-found 时的诊断。
 *
 * 策略：以 needle 的首行为 key，扫描各内容行（可限定行区间），取相似度最高的一行
 * 作为锚点；再用整段 needle 与该行起算的同长窗口比对，给出首个不一致字符。
 * 这是"够用且快"的折中（不做全文 N×L 窗口扫描），返回的相似度反映首行接近程度。
 */
export function computeNearestMatch(
  haystack: string,
  needle: string,
  opts: { lineRange?: LineRange } = {},
): NearestMatch {
  const offsets = buildLineOffsets(haystack);
  const totalLines = offsets.length;
  const range = resolveLineRange(opts.lineRange, totalLines);

  const lo = range ? range.start - 1 : 0;
  const hi = range ? range.end : totalLines;

  const needleLines = needle.split('\n');
  const needleFirst = needleLines[0];

  let bestSim = -1;
  let bestLine = lo + 1;
  for (let i = lo; i < hi; i++) {
    const lineStr = lineText(haystack, offsets, i + 1);
    const sim = similarityRatio(needleFirst, lineStr);
    if (sim > bestSim) {
      bestSim = sim;
      bestLine = i + 1;
    }
  }

  const bestLineText = lineText(haystack, offsets, bestLine);
  // 用整段 needle 与「锚点行起算的同长窗口」比对，得到首个不一致字符
  const candidate =
    needleLines.length > 1
      ? Array.from({ length: Math.min(needleLines.length, hi - (bestLine - 1)) }, (_, k) =>
          lineText(haystack, offsets, bestLine + k),
        ).join('\n')
      : bestLineText;

  const snippet = bestLineText.length > 200 ? bestLineText.slice(0, 200) + '…' : bestLineText;

  return {
    similarity: Math.max(0, bestSim),
    line: bestLine,
    column: 1,
    firstDiff: firstDiffChar(needle, candidate),
    snippet,
  };
}
