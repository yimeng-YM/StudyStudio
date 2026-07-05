import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 「仅供 AI 阅读」文本片段的标记前缀。
 * 用于消息 content 数组中那些只需要塞进模型上下文、但不应显示在聊天 UI 里的 text part
 * （例如：告知模型某张已上传图片对应的 attachment id）。
 * MessageRenderer 遇到以此前缀开头的 text part 会跳过渲染，但该 part 仍会随消息原样发给 AI。
 */
export const AI_ONLY_HINT_PREFIX = '<<<AI_ONLY_HINT>>>';

/**
 * 安全生成 UUID v4，兼容非安全上下文（如局域网 IP HTTP 访问）。
 * crypto.randomUUID() 仅在 https 或 localhost 下可用，
 * 在 http://192.168.x.x 等场景下会报错，此处提供 fallback。
 */
export function generateUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (_) { /* fallback */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 合并 Tailwind CSS 类名工具函数。
 * 结合了 clsx 和 tailwind-merge：首先使用 clsx 处理条件类名，
 * 然后使用 twMerge 解决 Tailwind 样式冲突（例如后续类名覆盖前置类名）。
 *
 * @param inputs - 类名数组、对象或字符串
 * @returns 合并和去重后的最终类名字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 清理包含 JSON 的字符串，移除 Markdown 代码块标记和代码注释。
 * 主要是为了提高对大语言模型 (AI) 生成的非标准或带有额外格式的 JSON 字符串的解析容错率。
 *
 * 核心逻辑：
 * 1. 尝试匹配并提取被 ```json 和 ``` 包裹的真实内容。
 * 2. 如果没有严格的包裹结构，则强行移除所有的 ```json 和 ``` 标记。
 * 3. 使用正则替换精准剥离单行 (//) 和多行 (/* *\/) 注释，同时利用正则分组匹配特性巧妙避开字符串字面量内部的类似字符。
 *
 * @param jsonString - 待处理的原始 JSON 字符串
 * @returns 清理完成的纯净 JSON 字符串
 */
export function cleanAIJson(jsonString: string): string {
  let clean = jsonString.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
  const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    clean = match[1].trim();
  } else {
    clean = clean.replace(/```json/gi, '').replace(/```/g, '').trim();
  }

  clean = clean.replace(/\\.|"(?:\\.|[^"\\])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g1) => {
    if (g1) return "";
    return m;
  });

  return clean.trim();
}

/**
 * 安全地解析由大语言模型生成的 JSON 字符串。
 * 先调用 cleanAIJson 做基础清理（剥 Markdown 代码块标记 + 注释）并尝试标准 JSON.parse；
 * 若失败，再调用 repairJsonString 进行宽容修复（单引号转双引号、裸 key 加引号、去尾随逗号、
 * 补全被截断的括号/字符串）后重试。两段式策略既保留严格解析的成功路径，又对 AI 长输出
 * 常见的格式瑕疵与流式截断提供容错。
 *
 * @template T - 期望返回的数据结构类型，默认为 any
 * @param jsonString - 待解析的 AI 响应字符串
 * @returns 解析并转换为对象的指定类型数据
 * @throws 当修复后仍不符合合法 JSON 格式时，抛出包含详细原因的 Error
 */
export function parseAIJson<T = any>(jsonString: string): T {
  if (!jsonString || !jsonString.trim()) {
    throw new Error("Invalid AI JSON: empty input");
  }
  try {
    return JSON.parse(cleanAIJson(jsonString));
  } catch (_first) {
    try {
      return JSON.parse(repairJsonString(jsonString)) as T;
    } catch (e) {
      throw new Error("Invalid AI JSON: " + (e instanceof Error ? e.message : String(e)));
    }
  }
}

/**
 * 剥离 Markdown 代码块围栏（如 ```json ... ```），仅处理代码块标记，不触碰字符串内部。
 * 作为宽容解析的统一第一步，供 repairJsonString / isJsonComplete 复用。
 */
function stripCodeFence(jsonString: string): string {
  let clean = jsonString.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
  const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    clean = match[1].trim();
  } else {
    clean = clean.replace(/```json/gi, '').replace(/```/g, '').trim();
  }
  return clean;
}

/**
 * 宽容修复 AI 生成的 JSON 字符串。
 * 采用字符级状态机，正确识别双引号/单引号字符串字面量与转义，避免误伤字符串内部内容。
 * 处理以下常见瑕疵：
 *   1. Markdown 代码块围栏（stripCodeFence）
 *   2. 字符串外的单行 // 与多行块注释（字符串内部的不误删）
 *   3. 单引号字符串 → 双引号字符串（串内双引号自动转义）
 *   4. 裸 key 加引号（{foo: 1} → {"foo": 1}）
 *   5. 尾随逗号（[1, 2,] → [1, 2]）
 *   6. 未闭合的字符串引号 / 括号补全（流式输出被 max_tokens 截断时的兜底）
 *
 * @param jsonString - 待修复的原始字符串
 * @returns 修复后尽量合法的 JSON 字符串
 */
function repairJsonString(jsonString: string): string {
  const s = stripCodeFence(jsonString);
  let out = '';
  const stack: Array<'{' | '['> = [];
  let i = 0;
  const n = s.length;
  // 解析状态：top 字符串外；str 双引号串内；single 单引号串内
  let mode: 'top' | 'str' | 'single' = 'top';
  let escape = false;

  while (i < n) {
    const c = s[i];

    if (mode === 'str') {
      out += c;
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') mode = 'top';
      i++;
      continue;
    }

    if (mode === 'single') {
      if (escape) {
        if (c === "'") out += "'";
        else if (c === '"') out += '\\"';
        else out += '\\' + c;
        escape = false; i++; continue;
      }
      if (c === '\\') { escape = true; i++; continue; }
      if (c === "'") { out += '"'; mode = 'top'; i++; continue; }
      if (c === '"') { out += '\\"'; i++; continue; }
      out += c; i++; continue;
    }

    // mode === 'top'：字符串外
    if (c === '"') { out += c; mode = 'str'; i++; continue; }
    if (c === "'") { out += '"'; mode = 'single'; i++; continue; }

    // 注释剥离（仅在字符串外处理，避免误删字符串内的 // 或 /*）
    if (c === '/' && s[i + 1] === '/') {
      i += 2;
      while (i < n && s[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (c === '{' || c === '[') { out += c; stack.push(c); i++; continue; }
    if (c === '}' || c === ']') {
      out += c;
      const top = stack[stack.length - 1];
      if ((c === '}' && top === '{') || (c === ']' && top === '[')) stack.pop();
      else if (stack.length) stack.pop();
      i++; continue;
    }

    // 尾随逗号：逗号后跨空白若遇 } 或 ]，删除该逗号
    if (c === ',') {
      let j = i + 1;
      while (j < n && /\s/.test(s[j])) j++;
      if (j < n && (s[j] === '}' || s[j] === ']')) { i++; continue; }
      out += c; i++; continue;
    }

    // 裸 key 检测：标识符后紧跟 : 且当前处于对象内 → 给 key 加引号
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(s[j])) j++;
      const ident = s.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(s[k])) k++;
      if (k < n && s[k] === ':' && stack[stack.length - 1] === '{') {
        out += '"' + ident + '"';
        i = j;
        continue;
      }
      out += ident;
      i = j;
      continue;
    }

    out += c; i++;
  }

  // 截断兜底：未闭合的字符串补上引号
  if (mode === 'str' || mode === 'single') out += '"';
  // 去掉字符串外残留的尾随逗号（截断常见，避免补全后产生 [,] 非法结构）
  out = out.replace(/,\s*$/, '');
  // 补全未闭合的括号
  while (stack.length) {
    const top = stack.pop() as '{' | '[';
    out += top === '{' ? '}' : ']';
  }
  return out;
}

/**
 * 判断 JSON 字符串是否结构完整（括号/方括号配平、字符串引号闭合）。
 * 仅做检测不做修复，用于识别流式输出是否被 max_tokens 截断，与 finish_reason 配合使用。
 *
 * @param jsonString - 待检测的原始字符串
 * @returns true 表示结构完整可直接解析；false 表示疑似被截断或括号失衡
 */
export function isJsonComplete(jsonString: string): boolean {
  if (!jsonString || !jsonString.trim()) return true;
  const s = stripCodeFence(jsonString);
  let mode: 'top' | 'str' | 'single' = 'top';
  let escape = false;
  const stack: Array<'{' | '['> = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (mode === 'str') {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') mode = 'top';
      continue;
    }
    if (mode === 'single') {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === "'") mode = 'top';
      continue;
    }
    if (c === '"') mode = 'str';
    else if (c === "'") mode = 'single';
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}') { if (stack.pop() !== '{') return false; }
    else if (c === ']') { if (stack.pop() !== '[') return false; }
  }
  return mode === 'top' && stack.length === 0;
}

/**
 * 解析 AI 工具调用的参数 JSON。
 * 相比 parseAIJson，针对 function calling 场景对空串/缺失参数兜底为空对象，
 * 避免无参工具回传空字符串时抛错。其余复用 parseAIJson 的两段式宽容解析。
 *
 * @param jsonString - 工具调用 arguments 字符串
 * @returns 解析后的参数对象
 */
export function parseToolArguments(jsonString: string): any {
  if (!jsonString || !jsonString.trim()) return {};
  return parseAIJson(jsonString);
}

/**
 * 处理剪贴板粘贴图片到 Markdown 编辑器。
 * 从剪贴板中提取图片 Blob → 存 db.attachments → 在光标位置插入 `![Image](attachment:<id>)`。
 * 供 NotesModule / QuizModule 等编辑器的 textarea onPaste 复用。
 *
 * 若无图片数据，不阻止默认行为（走文本粘贴）。
 *
 * @param e - 粘贴事件
 * @param textarea - 目标 textarea DOM 元素（用于获取光标位置）
 * @param getContent - 当前编辑器内容
 * @param setContent - 更新编辑器内容的 setter
 */
export async function handleEditorPasteImage(
  e: React.ClipboardEvent<HTMLTextAreaElement>,
  textarea: HTMLTextAreaElement | null,
  getContent: string,
  setContent: (val: string) => void
): Promise<void> {
  const items = e.clipboardData?.items;
  if (!items) return;

  const imageBlobs: { blob: Blob; mimeType: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) imageBlobs.push({ blob, mimeType: item.type });
    }
  }
  if (imageBlobs.length === 0) return; // 走默认文本粘贴

  e.preventDefault();

  try {
    // db 动态导入避免循环依赖（lib/utils 不直接依赖 @/db）
    const { db } = await import('@/db');
    const insertions: string[] = [];

    for (const { blob, mimeType } of imageBlobs) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const id = generateUUID();
      const ext = mimeType.split('/')[1] || 'png';
      await db.attachments.add({
        id,
        data: base64,
        mimeType,
        fileName: `clipboard.${ext}`,
        createdAt: Date.now(),
      });
      insertions.push(`![Image](attachment:${id})`);
    }

    // 将图片 markdown 插入光标位置
    const start = textarea?.selectionStart ?? getContent.length;
    const end = textarea?.selectionEnd ?? getContent.length;
    const scrollTop = textarea?.scrollTop ?? 0;
    const before = getContent.substring(0, start);
    const after = getContent.substring(end);
    let insertion = insertions.join('\n');
    // 在光标两端补换行，保证图片在新行
    if (start > 0 && getContent[start - 1] !== '\n') insertion = '\n' + insertion;
    if (end < getContent.length && getContent[end] !== '\n') insertion = insertion + '\n';

    const newContent = before + insertion + after;
    setContent(newContent);

    // 恢复光标到插入内容之后
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        const newPos = start + insertion.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.scrollTop = scrollTop;
      }
    }, 0);
  } catch (err) {
    console.error('粘贴图片处理失败:', err);
  }
}
