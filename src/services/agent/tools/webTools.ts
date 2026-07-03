import { db } from '@/db';

/**
 * 联网工具集（web_search / read_url / search_wikipedia）。
 *
 * 本项目是纯浏览器端 SPA，没有后端，无法直接 fetch 任意网页（CORS）。
 * 这里经「CORS 友好」的端点访问网络：
 *   - 搜索 web_search：可选后端
 *       · Jina  —— https://s.jina.ai/<query>        需 Jina API Key（免费注册 https://jina.ai/）
 *       · Serper —— https://google.serper.dev/search 需 Serper API Key（https://serper.dev/，Google 搜索结果）
 *   - 读网页 read_url：https://r.jina.ai/<url>       把指定网页转为干净 Markdown 正文，免 Key，始终可用
 *   - 维基百科 search_wikipedia：{lang}.wikipedia.org/w/api.php?origin=*  免 Key，权威百科，CORS 原生支持
 *
 * 搜索后端与各 API Key 存于 AIConfig（db.settings id=1），由「设置 → 高级参数」配置；
 * 是否启用 web_search / search_wikipedia 由 AI 对话界面的「工具」按钮开关控制（见 toolConfig.ts）。
 * read_url 不受开关控制，始终可用。所有错误以 { error } 形式回传给模型，便于其自适应。
 */

const SEARCH_ENDPOINT = 'https://s.jina.ai/';
const READER_ENDPOINT = 'https://r.jina.ai/';
const SERPER_ENDPOINT = 'https://google.serper.dev/search';

/** 单个网页正文的最大字符预算，防止超大页面灌进上下文撑爆 token */
const READ_DEFAULT_MAX_CHARS = 16000;
const READ_MAX_MAX_CHARS = 40000;
const READ_MIN_MAX_CHARS = 1000;
/** 搜索结果摘要 / 维基百科摘要的单条最大字符数 */
const SEARCH_SNIPPET_MAX_CHARS = 400;
const WIKIPEDIA_EXTRACT_MAX_CHARS = 1200;
/** 搜索默认 / 上限条数 */
const SEARCH_DEFAULT_RESULTS = 5;
const SEARCH_MAX_RESULTS = 10;
/** 维基百科默认 / 上限条数 */
const WIKIPEDIA_DEFAULT_LIMIT = 5;
const WIKIPEDIA_MAX_LIMIT = 10;
/** 联网请求统一超时，避免某个慢响应卡死 Agent 循环 */
const REQUEST_TIMEOUT_MS = 20000;

/** 搜索后端未配置对应 Key 时返回给模型的提示文案 */
const NO_JINA_KEY_HINT = 'Jina 联网服务需要 API Key（HTTP 401）。请在「设置 → 高级参数」填写 Jina API Key，免费注册：https://jina.ai/';
const NO_SERPER_KEY_HINT = '当前搜索后端为 Serper，但未配置 Serper API Key。请在「设置 → 高级参数」填写 Serper API Key。';

/**
 * 带超时的 fetch 封装。超时触发 AbortController，避免请求无限挂起。
 */
async function fetchWithTimeout(url: string, init: RequestInit, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 读取用户配置的 Jina API Key（存于 AIConfig.jinaApiKey），组装 Jina 请求头。
 * 无 Key 时仅带 Accept 头，read_url 仍可免 Key 工作；web_search（Jina）若 401 会转为提示文案。
 */
async function jinaHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  try {
    const cfg = await db.settings.get(1) as any;
    const key = cfg?.jinaApiKey;
    if (typeof key === 'string' && key.trim()) {
      headers['Authorization'] = `Bearer ${key.trim()}`;
    }
  } catch { /* 读配置失败不影响请求，按无 Key 处理 */ }
  return headers;
}

/**
 * 读取搜索后端与各 Key（存于 AIConfig），供 web_search 分发使用。
 */
async function readWebSearchConfig(): Promise<{ backend: 'jina' | 'serper'; serperKey: string }> {
  try {
    const cfg = await db.settings.get(1) as any;
    const backend: 'jina' | 'serper' = cfg?.webSearchBackend === 'serper' ? 'serper' : 'jina';
    const serperKey = typeof cfg?.serperApiKey === 'string' ? cfg.serperApiKey.trim() : '';
    return { backend, serperKey };
  } catch {
    return { backend: 'jina', serperKey: '' };
  }
}

/** 截断字符串并折叠空白，超出部分用省略号收尾 */
function clip(s: string, max: number): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * 兜底解析 Jina 搜索的纯文本 / Markdown 响应。
 * JSON 路径是主路径；当响应不是 JSON（接口异常或降级为 markdown）时启用。
 * 启发式：抓取 [title](url) 链接行或裸 URL 行，附近文本作为标题/摘要。
 */
function parseMarkdownSearchResults(md: string): { title?: string; url?: string; content?: string }[] {
  const items: { title?: string; url?: string; content?: string }[] = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const linkMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
    if (linkMatch) {
      items.push({
        title: linkMatch[1],
        url: linkMatch[2],
        content: lines.slice(i + 1, i + 4).join(' ').trim(),
      });
      continue;
    }
    const urlOnly = line.match(/^\s*(https?:\/\/[^\s]+)\s*$/);
    if (urlOnly) {
      const prev = (lines[i - 1] || '').replace(/^#+\s*/, '').trim();
      items.push({
        title: prev,
        url: urlOnly[1],
        content: lines.slice(i + 1, i + 4).join(' ').trim(),
      });
    }
  }
  return items;
}

/**
 * 在网络上搜索关键词，返回若干结果的标题、URL 与短摘要。
 *
 * 后端由 AIConfig.webSearchBackend 决定：
 *   - 'jina'（默认）：GET https://s.jina.ai/<query>，Authorization: Bearer <jinaKey>
 *   - 'serper'：POST https://google.serper.dev/search，X-API-KEY: <serperKey>，body { q, num }
 *
 * @param args.query - 搜索关键词（必填）
 * @param args.max_results - 返回结果上限（可选，默认 5，上限 10）
 * @returns { query, count, results: [{ title, url, snippet }] }（Serper 可能附带 knowledgeGraph）；失败时返回 { error, query }
 */
export const web_search = async ({ query, max_results }: { query: string; max_results?: number }) => {
  if (!query || !query.trim()) {
    return { error: '缺少搜索关键词 query' };
  }
  const limit = Math.min(Math.max(max_results ?? SEARCH_DEFAULT_RESULTS, 1), SEARCH_MAX_RESULTS);
  const q = query.trim();
  const { backend, serperKey } = await readWebSearchConfig();

  // ── Serper 后端 ──
  if (backend === 'serper') {
    if (!serperKey) return { error: NO_SERPER_KEY_HINT, query: q };
    try {
      const resp = await fetchWithTimeout(SERPER_ENDPOINT, {
        method: 'POST',
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, num: limit }),
      });
      if (resp.status === 401 || resp.status === 403) {
        return { error: `Serper API Key 无效或未授权（HTTP ${resp.status}），请在设置中检查 Key。`, query: q };
      }
      if (resp.status === 429) {
        return { error: 'Serper 限流（429），请稍后重试。', query: q };
      }
      if (!resp.ok) {
        return { error: `Serper 搜索失败: HTTP ${resp.status}`, query: q };
      }
      const data = await resp.json();
      const organic: any[] = Array.isArray(data?.organic) ? data.organic : [];
      const results = organic
        .slice(0, limit)
        .map((it) => ({
          title: (it.title || '').trim() || '(无标题)',
          url: (it.link || '').trim(),
          snippet: clip(it.snippet || '', SEARCH_SNIPPET_MAX_CHARS),
        }))
        .filter((r) => r.url);

      const out: any = { query: q, count: results.length, results };
      if (data?.knowledgeGraph && (data.knowledgeGraph.title || data.knowledgeGraph.description)) {
        out.knowledgeGraph = {
          title: (data.knowledgeGraph.title || '').trim(),
          description: clip(data.knowledgeGraph.description || '', SEARCH_SNIPPET_MAX_CHARS),
        };
      }
      if (results.length === 0 && !out.knowledgeGraph) {
        out.message = '未找到相关结果。可尝试更换关键词，或用 read_url 读取已知权威链接。';
      }
      return out;
    } catch (e: any) {
      if (e?.name === 'AbortError') return { error: 'Serper 搜索超时（20s）。', query: q };
      // 多为网络/CORS 失败：Serper 由浏览器直接调用，需其服务支持 CORS
      return { error: 'Serper 请求失败：可能是网络或 CORS 限制。若持续失败，可在设置中改用 Jina 后端。', query: q };
    }
  }

  // ── Jina 后端（默认） ──
  try {
    const resp = await fetchWithTimeout(`${SEARCH_ENDPOINT}${encodeURIComponent(q)}`, { headers: await jinaHeaders() });
    if (resp.status === 401) {
      return { error: NO_JINA_KEY_HINT, query: q };
    }
    if (resp.status === 429) {
      return { error: '搜索服务限流（429），请稍后重试或换个关键词。', query: q };
    }
    if (!resp.ok) {
      return { error: `搜索请求失败: HTTP ${resp.status}`, query: q };
    }
    const text = await resp.text();

    let items: { title?: string; url?: string; content?: string; description?: string }[] = [];
    try {
      const json = JSON.parse(text);
      items = Array.isArray(json?.data) ? json.data : [];
    } catch {
      // 非 JSON 响应：按 Markdown 兜底解析
      items = parseMarkdownSearchResults(text);
    }

    const results = items
      .slice(0, limit)
      .map((it) => ({
        title: (it.title || '').trim() || '(无标题)',
        url: (it.url || '').trim(),
        snippet: clip(it.content || it.description || '', SEARCH_SNIPPET_MAX_CHARS),
      }))
      .filter((r) => r.url);

    if (results.length === 0) {
      return {
        query: q,
        count: 0,
        results: [],
        message: '未找到相关结果。可尝试更换关键词，或直接用 read_url 读取已知权威链接。',
      };
    }
    return { query: q, count: results.length, results };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { error: '搜索请求超时（20s），可稍后重试。', query: q };
    return { error: `搜索出错: ${e?.message || e}`, query: q };
  }
};

/**
 * 抓取指定网页并返回其正文（干净 Markdown），供模型读取完整信息后纳入上下文。
 * 经 Jina Reader（r.jina.ai），免 Key，始终可用（不受联网搜索开关控制）。
 *
 * 典型用法：web_search / search_wikipedia 得到候选 URL → 挑选权威来源 → read_url 读取全文 → 据此回答并引用来源。
 *
 * @param args.url - 目标网址（必填）。缺少 http(s):// 前缀时自动补上。
 * @param args.max_chars - 返回正文的字符上限（可选，默认 16000，上限 40000，下限 1000）
 * @returns { url, title, content, chars, full_chars, truncated }；失败时返回 { error, url }
 */
export const read_url = async ({ url, max_chars }: { url: string; max_chars?: number }) => {
  if (!url || !url.trim()) {
    return { error: '缺少目标网址 url' };
  }
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) {
    target = `https://${target}`;
  }
  const budget = Math.min(Math.max(max_chars ?? READ_DEFAULT_MAX_CHARS, READ_MIN_MAX_CHARS), READ_MAX_MAX_CHARS);
  const endpoint = `${READER_ENDPOINT}${target}`;

  try {
    const resp = await fetchWithTimeout(endpoint, { headers: await jinaHeaders() });
    if (resp.status === 429) {
      return { error: '读取服务限流（429），请稍后重试。', url: target };
    }
    if (!resp.ok) {
      return { error: `读取网页失败: HTTP ${resp.status}`, url: target };
    }
    const text = await resp.text();

    let title = '';
    let content = '';
    try {
      const json = JSON.parse(text);
      title = json?.data?.title || '';
      content = json?.data?.content || '';
      // 极个别接口把正文放在 data 字符串里
      if (!content && typeof json?.data === 'string') content = json.data;
    } catch {
      // 非 JSON 响应：整个响应即 Markdown 正文
      content = text;
    }

    content = (content || '').trim();
    if (!content) {
      return {
        error: '页面正文为空，可能是 JS 渲染页 / 付费墙 / 被屏蔽。可尝试换一个链接。',
        url: target,
        title,
      };
    }

    const truncated = content.length > budget;
    const clipped = truncated ? content.slice(0, budget) : content;
    return {
      url: target,
      title: title.trim(),
      content: clipped,
      chars: clipped.length,
      full_chars: content.length,
      truncated,
    };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { error: '读取网页超时（20s），可稍后重试。', url: target };
    return { error: `读取网页出错: ${e?.message || e}`, url: target };
  }
};

/**
 * 在维基百科搜索权威百科知识，返回若干条目的标题、URL 与导语摘要（plaintext）。
 * 经 Wikipedia Action API（origin=* 实现 CORS），免 Key。
 *
 * @param args.query - 搜索关键词（必填）
 * @param args.language - 语言版本（可选，默认 'zh'）。技术/学术类主题建议传 'en'，覆盖更全；模型再用中文回答。
 * @param args.limit - 返回条目上限（可选，默认 5，上限 10）
 * @returns { query, language, count, results: [{ title, url, extract }] }；失败时返回 { error, query, language }
 */
export const search_wikipedia = async ({ query, language, limit }: { query: string; language?: string; limit?: number }) => {
  if (!query || !query.trim()) {
    return { error: '缺少搜索关键词 query' };
  }
  const lang = (language || 'zh').trim().toLowerCase() || 'zh';
  const lim = Math.min(Math.max(limit ?? WIKIPEDIA_DEFAULT_LIMIT, 1), WIKIPEDIA_MAX_LIMIT);
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(query.trim())}&gsrlimit=${lim}&prop=extracts|info&exintro=1&explaintext=1&inprop=url`;

  try {
    const resp = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      return { error: `维基百科查询失败: HTTP ${resp.status}`, query, language: lang };
    }
    const data = await resp.json();
    const pages = data?.query?.pages;
    if (!pages) {
      return {
        query,
        language: lang,
        count: 0,
        results: [],
        message: '未找到相关条目。可尝试更换关键词，或改用英文（language: "en"）覆盖更广。',
      };
    }

    const arr = Object.values(pages) as any[];
    arr.sort((a, b) => (a.index ?? 999) - (b.index ?? 999));
    const results = arr.slice(0, lim).map((p) => ({
      title: (p.title || '').trim() || '(无标题)',
      url: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title || '')}`,
      extract: clip(p.extract || '', WIKIPEDIA_EXTRACT_MAX_CHARS),
    }));

    if (results.length === 0) {
      return {
        query,
        language: lang,
        count: 0,
        results: [],
        message: '未找到相关条目。可尝试更换关键词，或改用英文（language: "en"）覆盖更广。',
      };
    }
    return { query, language: lang, count: results.length, results };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { error: '维基百科查询超时（20s）。', query, language: lang };
    return { error: `维基百科查询出错: ${e?.message || e}`, query, language: lang };
  }
};