import { db } from '@/db';
import { DEFAULT_LOCAL_SEARCH_BASE_URL, getLocalSearchBaseUrl, getSearchBackend } from '@/lib/toolConfig';

/**
 * 联网工具集（web_search / read_url / image_search / Wikipedia）。
 *
 * 联网搜索与网页读取共用同一后端（见 AIConfig.webSearchBackend）：
 *   - 'local'：调用同源 /api，由本地 Gateway + SearXNG 完成搜索和网页提取，无需第三方 API Key
 *   - 'serper'：搜索 POST https://google.serper.dev/search，读取 POST https://scrape.serper.dev
 *       两者均需 Serper API Key（X-API-KEY，https://serper.dev/）
 *   - 'jina'：搜索 GET https://s.jina.ai/<query>（需 Jina Key，免注册有限额度），读取 GET https://r.jina.ai/<url>（免 Key）
 *
 * 两个维基来源（多重信息交叉）：
 *   - search_wikipedia：原站 {lang}.wikipedia.org/w/api.php?origin=*，免 Key、CORS 原生支持（原站被墙，默认关闭，挂 VPN 时可用）
 *   - search_wikipedia_web：经当前搜索后端对 wikipedia.org 做站内搜索（query site:wikipedia.org）
 *
 * 后端、各 Key 均存于 AIConfig（db.settings id=1），由「设置 → 高级参数」配置；
 * 是否启用各工具由 AI 对话界面的「工具」按钮开关控制（见 toolConfig.ts 的联动规则）。所有错误以 { error } 形式回传给模型，便于其自适应。
 */

const SEARCH_ENDPOINT = 'https://s.jina.ai/';
const READER_ENDPOINT = 'https://r.jina.ai/';
const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const SCRAPE_SERPER_ENDPOINT = 'https://scrape.serper.dev';
const SERPER_IMAGES_ENDPOINT = 'https://google.serper.dev/images';
const DEFAULT_LOCAL_API_BASE = DEFAULT_LOCAL_SEARCH_BASE_URL;

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
/** 图片搜索默认 / 上限条数 */
const IMAGE_SEARCH_DEFAULT_RESULTS = 6;
const IMAGE_SEARCH_MAX_RESULTS = 10;
/** read_url 页内提取图片的最大数量，避免图文混排页面撑爆返回体 */
const READ_URL_MAX_IMAGES = 20;
/** 维基百科默认 / 上限条数 */
const WIKIPEDIA_DEFAULT_LIMIT = 5;
const WIKIPEDIA_MAX_LIMIT = 10;
/** 联网请求统一超时，避免某个慢响应卡死 Agent 循环 */
const REQUEST_TIMEOUT_MS = 20000;
/** 本地 Playwright 降级渲染可能比普通抓取更久。 */
const LOCAL_EXTRACT_TIMEOUT_MS = 45000;

// ── 搜索结果会话级缓存（TTL 5 分钟，避免相同查询重复消耗 API 额度） ──
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<string, { data: any; ts: number }>();
const imageCache = new Map<string, { data: any; ts: number }>();

function makeCacheKey(backend: string, query: string, limit: number): string {
  return `${backend}::${query}::${limit}`;
}

function cacheRead(cache: Map<string, { data: any; ts: number }>, key: string): any | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts < SEARCH_CACHE_TTL_MS) return entry.data;
  // 过期清理
  cache.delete(key);
  return undefined;
}

function cacheWrite(cache: Map<string, { data: any; ts: number }>, key: string, data: any): void {
  cache.set(key, { data, ts: Date.now() });
}

/** 搜索后端未配置对应 Key 时返回给模型的提示文案 */
const NO_JINA_KEY_HINT = 'Jina 联网服务需要 API Key（HTTP 401）。请在「设置 → 高级参数」填写 Jina API Key，免费注册：https://jina.ai/';
const NO_SERPER_KEY_HINT = 'Serper 联网服务（搜索 / 网页读取）需要 API Key。请在「设置 → 高级参数」填写 Serper API Key（https://serper.dev/）。';

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
 * 无 Key 时仅带 Accept 头，read_url（Jina Reader）仍可免 Key 工作；web_search（Jina）若 401 会转为提示文案。
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
 * 读取搜索/读取后端配置，供 web_search / read_url / image_search 分发使用。
 */
async function readWebSearchConfig(): Promise<{
  backend: 'local' | 'jina' | 'serper';
  serperKey: string;
  localBaseUrl: string;
}> {
  try {
    const cfg = await db.settings.get(1) as any;
    const backend = getSearchBackend(cfg);
    const serperKey = typeof cfg?.serperApiKey === 'string' ? cfg.serperApiKey.trim() : '';
    const localBaseUrl = getLocalSearchBaseUrl(cfg);
    return { backend, serperKey, localBaseUrl };
  } catch {
    return { backend: 'local', serperKey: '', localBaseUrl: DEFAULT_LOCAL_API_BASE };
  }
}

/** 调用本地 Gateway，并把 HTTP 错误统一转换为现有工具约定的 { error }。 */
async function requestLocalBackend(
  localBaseUrl: string,
  path: string,
  payload: Record<string, unknown>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<any> {
  const response = await fetchWithTimeout(`${localBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, timeoutMs);
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    return { error: data?.error || data?.detail || `本地联网服务请求失败: HTTP ${response.status}` };
  }
  return data;
}

/** 截断字符串并折叠空白，超出部分用省略号收尾 */
function clip(s: string, max: number): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * 从 Markdown 正文中提取图片链接（`![alt](url)` 语法 + 裸 `<img>` 标签），用于 read_url 附带页内图片。
 * 按出现顺序去重，最多返回 max 张，避免图文混排页面把返回体撑爆。
 * 跳过 data: URI（base64 内联图片），仅保留绝对 HTTP(S) URL。
 */
function extractImageUrls(markdown: string, max: number): string[] {
  if (!markdown) return [];
  const seen = new Set<string>();
  const urls: string[] = [];

  // 第一遍：Markdown ![]() 语法
  const mdRe = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(markdown)) && urls.length < max) {
    const url = m[1];
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  // 第二遍：HTML <img src="..."> 标签（部分抓取结果保留原始 HTML）
  if (urls.length < max) {
    const htmlRe = /<img[^>]+src=["'](https?:\/\/[^\s"']+)["'][^>]*>/gi;
    while ((m = htmlRe.exec(markdown)) && urls.length < max) {
      const url = m[1];
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }

  return urls;
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
 * Jina 搜索（从 web_search 抽取，供正常路径和降级回退共用）。
 */
async function searchViaJina(q: string, limit: number): Promise<any> {
  const resp = await fetchWithTimeout(`${SEARCH_ENDPOINT}${encodeURIComponent(q)}`, { headers: await jinaHeaders() });
  if (resp.status === 401) {
    return { error: NO_JINA_KEY_HINT, query: q };
  }
  if (resp.status === 429) {
    return { error: 'search_via_jina_429', query: q }; // 特殊标记，供调用方判断降级结果
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
}

/**
 * Jina Reader 读取网页（从 read_url 抽取，供正常路径和降级回退共用）。
 */
async function readUrlViaJina(target: string, budget: number): Promise<any> {
  const endpoint = `${READER_ENDPOINT}${target}`;
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
    if (!content && typeof json?.data === 'string') content = json.data;
  } catch {
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
  const images = extractImageUrls(content, READ_URL_MAX_IMAGES);
  return {
    url: target,
    title: title.trim(),
    content: clipped,
    chars: clipped.length,
    full_chars: content.length,
    truncated,
    ...(images.length > 0 ? { images } : {}),
  };
}

/**
 * 在网络上搜索关键词，返回若干结果的标题、URL 与短摘要。
 *
 * 后端由 AIConfig.webSearchBackend 决定：
 *   - 'serper'（默认）：POST https://google.serper.dev/search，X-API-KEY: <serperKey>，body { q, num }
 *   - 'jina'：GET https://s.jina.ai/<query>，Authorization: Bearer <jinaKey>
 *
 * 降级链（仅 Serper 后端）：Serper 401/429 → Jina（需 Key）
 * 相同查询 5 分钟内命中缓存直接返回，不消耗 API 额度。
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
  const { backend, serperKey, localBaseUrl } = await readWebSearchConfig();

  // 检查会话级缓存
  const cacheKey = makeCacheKey(backend, q, limit);
  const cached = cacheRead(searchCache, cacheKey);
  if (cached) return cached;

  // ── 本地 Gateway + SearXNG ──
  if (backend === 'local') {
    try {
      const result = await requestLocalBackend(localBaseUrl, '/web/search', { query: q, max_results: limit });
      if (!result.error) cacheWrite(searchCache, cacheKey, result);
      return result.error ? { ...result, query: q } : result;
    } catch (e: any) {
      if (e?.name === 'AbortError') return { error: '本地搜索超时（20s）。', query: q };
      return { error: '无法连接本地搜索后端。请运行 start-search.bat，并在高级设置中检查本地 API 地址。', query: q };
    }
  }

  // ── Serper 后端（默认），含降级链 ──
  if (backend === 'serper') {
    if (!serperKey) return { error: NO_SERPER_KEY_HINT, query: q };

    // 辅助：解析 Serper JSON 响应，提取 results + knowledgeGraph + peopleAlsoAsk
    const parseSerperResponse = (data: any) => {
      const organic: any[] = Array.isArray(data?.organic) ? data.organic : [];
      const results = organic
        .slice(0, limit)
        .map((it) => {
          const r: { title: string; url: string; snippet: string; date?: string } = {
            title: (it.title || '').trim() || '(无标题)',
            url: (it.link || '').trim(),
            snippet: clip(it.snippet || '', SEARCH_SNIPPET_MAX_CHARS),
          };
          if (it.date) r.date = String(it.date).trim();
          return r;
        })
        .filter((r) => r.url);

      const out: any = { query: q, count: results.length, results };

      const kg = data?.knowledgeGraph;
      if (kg && (kg.title || kg.description)) {
        const kgOut: { title: string; description: string; attributes?: Record<string, string>; website?: string; source?: string } = {
          title: (kg.title || '').trim(),
          description: clip(kg.description || '', SEARCH_SNIPPET_MAX_CHARS * 2),
        };
        if (kg.attributes && typeof kg.attributes === 'object') {
          const attrs: Record<string, string> = {};
          for (const [k, v] of Object.entries(kg.attributes)) {
            attrs[k] = clip(String(v ?? ''), 200);
          }
          kgOut.attributes = attrs;
        }
        if (kg.website) kgOut.website = String(kg.website).trim();
        if (kg.descriptionLink || kg.descriptionSource) kgOut.source = (kg.descriptionLink || kg.descriptionSource || '').trim();
        out.knowledgeGraph = kgOut;
      }

      const paa: any[] = Array.isArray(data?.peopleAlsoAsk) ? data.peopleAlsoAsk : [];
      if (paa.length > 0) {
        const qa = paa
          .slice(0, 4)
          .map((p) => ({
            question: (p.question || '').trim(),
            snippet: clip(p.snippet || '', SEARCH_SNIPPET_MAX_CHARS),
            url: (p.link || '').trim(),
          }))
          .filter((p) => p.question);
        if (qa.length > 0) out.peopleAlsoAsk = qa;
      }

      if (results.length === 0 && !out.knowledgeGraph) {
        out.message = '未找到相关结果。可尝试更换关键词，或用 read_url 读取已知权威链接。';
      }
      return out;
    };

    // ── 第 1 层：Serper ──
    try {
      const resp = await fetchWithTimeout(SERPER_ENDPOINT, {
        method: 'POST',
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, num: limit }),
      });
      if (resp.status === 401 || resp.status === 403) {
        // Key 无效 → 尝试降级到 Jina
        const jinaResult = await searchViaJina(q, limit);
        if (jinaResult.error) {
          return { error: `Serper API Key 无效（HTTP ${resp.status}），Jina 也不可用。请在设置中检查 Key。`, query: q };
        }
        jinaResult.backend = 'jina-fallback';
        cacheWrite(searchCache, cacheKey, jinaResult);
        return jinaResult;
      }
      if (resp.status === 429) {
        // Serper 限流 → 尝试降级到 Jina
        const jinaResult = await searchViaJina(q, limit);
        if (jinaResult.error) {
          return { error: 'Serper 和 Jina 均限流，请稍后重试。', query: q };
        }
        jinaResult.backend = 'jina-fallback';
        cacheWrite(searchCache, cacheKey, jinaResult);
        return jinaResult;
      }
      if (!resp.ok) {
        return { error: `Serper 搜索失败: HTTP ${resp.status}`, query: q };
      }
      const data = await resp.json();
      const out = parseSerperResponse(data);
      cacheWrite(searchCache, cacheKey, out);
      return out;
    } catch (e: any) {
      if (e?.name === 'AbortError') return { error: 'Serper 搜索超时（20s）。', query: q };
      return { error: 'Serper 请求失败：可能是网络或 CORS 限制。若持续失败，可在设置中改用 Jina 后端。', query: q };
    }
  }

  // ── Jina 后端（用户主动选择） ──
  try {
    const result = await searchViaJina(q, limit);
    if (result.error) return result;
    cacheWrite(searchCache, cacheKey, result);
    return result;
  } catch (e: any) {
    if (e?.name === 'AbortError') return { error: '搜索请求超时（20s），可稍后重试。', query: q };
    return { error: `搜索出错: ${e?.message || e}`, query: q };
  }
};

/**
 * 在网络上搜索图片，返回若干候选图片的直链、来源页面与标题。
 * 支持 Local/SearXNG 与 Serper；Jina 无对等的通用图片搜索接口。
 * 相同查询 5 分钟内命中缓存直接返回。
 *
 * @param args.query - 搜索关键词（必填）
 * @param args.max_results - 返回结果上限（可选，默认 6，上限 10）
 * @returns { query, count, results: [{ title, imageUrl, sourceUrl }] }；失败时返回 { error, query }
 */
export const image_search = async ({ query, max_results }: { query: string; max_results?: number }) => {
  if (!query || !query.trim()) {
    return { error: '缺少搜索关键词 query' };
  }
  const limit = Math.min(Math.max(max_results ?? IMAGE_SEARCH_DEFAULT_RESULTS, 1), IMAGE_SEARCH_MAX_RESULTS);
  const q = query.trim();
  const { backend, serperKey, localBaseUrl } = await readWebSearchConfig();

  if (backend === 'local') {
    const cacheKey = makeCacheKey('local-images', q, limit);
    const cached = cacheRead(imageCache, cacheKey);
    if (cached) return cached;
    try {
      const result = await requestLocalBackend(localBaseUrl, '/web/images', { query: q, max_results: limit });
      if (!result.error) cacheWrite(imageCache, cacheKey, result);
      return result.error ? { ...result, query: q } : result;
    } catch (e: any) {
      if (e?.name === 'AbortError') return { error: '本地图片搜索超时（20s）。', query: q };
      return { error: '无法连接本地搜索后端。请确认本地 Gateway 与 SearXNG 已启动。', query: q };
    }
  }

  if (backend !== 'serper') {
    return { error: '图片搜索支持 Local 或 Serper 后端，请在「设置 → 高级参数」中切换后端。', query: q };
  }
  if (!serperKey) return { error: NO_SERPER_KEY_HINT, query: q };

  // 检查缓存
  const cacheKey = makeCacheKey('serper-images', q, limit);
  const cached = cacheRead(imageCache, cacheKey);
  if (cached) return cached;

  try {
    const resp = await fetchWithTimeout(SERPER_IMAGES_ENDPOINT, {
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
      return { error: `Serper 图片搜索失败: HTTP ${resp.status}`, query: q };
    }
    const data = await resp.json();
    const images: any[] = Array.isArray(data?.images) ? data.images : [];
    const results = images
      .slice(0, limit)
      .map((it) => ({
        title: (it.title || '').trim() || '(无标题)',
        imageUrl: (it.imageUrl || '').trim(),
        sourceUrl: (it.link || '').trim(),
      }))
      .filter((r) => r.imageUrl);

    if (results.length === 0) {
      return { query: q, count: 0, results: [], message: '未找到相关图片。可尝试更换关键词。' };
    }
    const out = { query: q, count: results.length, results };
    cacheWrite(imageCache, cacheKey, out);
    return out;
  } catch (e: any) {
    if (e?.name === 'AbortError') return { error: 'Serper 图片搜索超时（20s）。', query: q };
    return { error: 'Serper 图片搜索请求失败：可能是网络或 CORS 限制。', query: q };
  }
};

/**
 * 抓取指定网页并返回其正文（干净 Markdown），供模型读取完整信息后纳入上下文。
 *
 * 后端与 web_search 共用（AIConfig.webSearchBackend）：
 *   - 'serper'（默认）：POST https://scrape.serper.dev，X-API-KEY: <serperKey>，body { url, includeMarkdown: true } → 返回 Markdown 正文
 *       429 限流时自动降级到 Jina Reader（免 Key）。
 *   - 'jina'：GET https://r.jina.ai/<url>，免 Key，返回干净 Markdown
 *
 * 典型用法：web_search / search_wikipedia(_web) 得到候选 URL → 挑选权威来源 → read_url 读取全文 → 据此回答并引用来源。
 * 挑选候选 URL 时，优先选择国内网络可直接访问的站点——部分域名（如原版 wikipedia.org、twitter.com/x.com 等）
 * 在中国大陆网络环境下可能无法被抓取服务正常读取，应优先换用可达的镜像/替代来源。
 *
 * 返回内容中若正文包含图片（Markdown `![]()` 语法或 `<img>` 标签），会额外提取到 images 字段，
 * 可直接用于笔记：将 images 中的 URL 写入笔记 Markdown，或调用 insert_image_into_note 工具插入指定笔记。
 *
 * @param args.url - 目标网址（必填）。缺少 http(s):// 前缀时自动补上。
 * @param args.max_chars - 返回正文的字符上限（可选，默认 16000，上限 40000，下限 1000）
 * @returns { url, title, content, chars, full_chars, truncated, images }；失败时返回 { error, url }
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
  const { backend, serperKey, localBaseUrl } = await readWebSearchConfig();

  // ── 本地 Gateway：由服务端处理 CORS、正文抽取、JS 渲染与 SSRF 防护 ──
  if (backend === 'local') {
    try {
      const result = await requestLocalBackend(
        localBaseUrl,
        '/web/extract',
        { url: target, max_chars: budget },
        LOCAL_EXTRACT_TIMEOUT_MS,
      );
      return result.error ? { ...result, url: target } : result;
    } catch (e: any) {
      if (e?.name === 'AbortError') return { error: '本地网页提取超时（45s）。', url: target };
      return { error: '无法连接本地网页提取服务。请运行 start-search.bat，并检查本地 API 地址。', url: target };
    }
  }

  // ── Serper scrape 后端（默认） ──
  if (backend === 'serper') {
    if (!serperKey) return { error: NO_SERPER_KEY_HINT, url: target };
    try {
      const resp = await fetchWithTimeout(SCRAPE_SERPER_ENDPOINT, {
        method: 'POST',
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target, includeMarkdown: true }),
      });
      if (resp.status === 401 || resp.status === 403) {
        // Key 无效 → 自动降级到 Jina Reader（免 Key）
        const jinaResult = await readUrlViaJina(target, budget);
        if (!jinaResult.error) {
          jinaResult.backend = 'jina-fallback';
        }
        return jinaResult;
      }
      if (resp.status === 429) {
        // Serper 限流 → 自动降级到 Jina Reader（免 Key）
        const jinaResult = await readUrlViaJina(target, budget);
        if (!jinaResult.error) {
          jinaResult.backend = 'jina-fallback';
        }
        return jinaResult;
      }
      if (!resp.ok) {
        return { error: `读取网页失败: HTTP ${resp.status}`, url: target };
      }
      const text = await resp.text();
      let title = '';
      let content = '';
      try {
        const json = JSON.parse(text);
        title = json?.metadata?.title || json?.metadata?.['og:title'] || json?.title || '';
        content = json?.markdown || json?.text || '';
      } catch {
        content = text;
      }

      content = (content || '').trim();
      if (!content) {
        return {
          error: '页面正文为空，可能是 JS 渲染页 / 付费墙 / 被屏蔽。可尝试换一个链接。',
          url: target,
          title: title.trim(),
        };
      }
      const truncated = content.length > budget;
      const clipped = truncated ? content.slice(0, budget) : content;
      const images = extractImageUrls(content, READ_URL_MAX_IMAGES);
      return {
        url: target,
        title: title.trim(),
        content: clipped,
        chars: clipped.length,
        full_chars: content.length,
        truncated,
        ...(images.length > 0 ? { images } : {}),
      };
    } catch (e: any) {
      if (e?.name === 'AbortError') return { error: '读取网页超时（20s），可稍后重试。', url: target };
      return { error: `读取网页出错: ${e?.message || e}`, url: target };
    }
  }

  // ── Jina Reader 后端 ──
  try {
    return await readUrlViaJina(target, budget);
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
  const base = `https://${lang}.wikipedia.org`;
  const res = await queryWikipediaLike(base, query, limit);
  if (res.error) return { error: res.error, query, language: lang };
  return { query, language: lang, count: res.count, results: res.results };
};

/**
 * 在维基百科做**站内搜索**：经当前 web_search 后端对 wikipedia.org 做 `site:` 搜索。
 * 默认开启；复用 Local/Serper/Jina 的错误处理。拿到链接后可用 read_url 读取全文。
 *
 * @param args.query - 搜索关键词（必填）
 * @param args.max_results - 返回结果上限（可选，默认 5，上限 10）
 * @returns { query, count, results: [{ title, url, snippet, date? }] }（可能附带 knowledgeGraph）；失败时返回 { error, query }
 */
export const search_wikipedia_web = async ({ query, max_results }: { query: string; max_results?: number }) => {
  if (!query || !query.trim()) {
    return { error: '缺少搜索关键词 query' };
  }
  const limit = Math.min(Math.max(max_results ?? WIKIPEDIA_DEFAULT_LIMIT, 1), WIKIPEDIA_MAX_LIMIT);
  // 用当前后端对 wikipedia.org 做站内搜索
  const res = await web_search({ query: `${query.trim()} site:wikipedia.org`, max_results: limit });
  if (res.error) return { error: res.error, query: query.trim() };
  // 兜底：只保留 wikipedia.org 链接（site: 过滤通常已保证，Jina 等不识别 site: 时由此兜底）
  const results = (Array.isArray(res.results) ? res.results : []).filter((r: any) => /wikipedia\.org\//i.test(r.url || ''));
  const out: { query: string; count: number; results: any[]; knowledgeGraph?: any; message?: string } = {
    query: query.trim(),
    count: results.length,
    results,
  };
  if (res.knowledgeGraph) out.knowledgeGraph = res.knowledgeGraph;
  if (results.length === 0 && !out.knowledgeGraph) {
    out.message = '未在维基百科找到相关条目。可尝试更换关键词，或用 read_url 读取已知维基链接。';
  }
  return out;
};

/**
 * 维基百科 Action API 的共享查询实现（供 search_wikipedia 原站使用）。
 * 给定站点根（如 https://zh.wikipedia.org），调用 {base}/w/api.php 搜索并返回导语摘要。
 */
async function queryWikipediaLike(
  base: string,
  query: string,
  limit?: number
): Promise<{ count: number; results: { title: string; url: string; extract: string }[]; error?: string }> {
  const lim = Math.min(Math.max(limit ?? WIKIPEDIA_DEFAULT_LIMIT, 1), WIKIPEDIA_MAX_LIMIT);
  const baseClean = (base || '').trim().replace(/\/+$/, '');
  if (!baseClean) return { count: 0, results: [], error: '维基百科查询地址为空。' };
  const url = `${baseClean}/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(query.trim())}&gsrlimit=${lim}&prop=extracts|info&exintro=1&explaintext=1&inprop=url`;

  try {
    const resp = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      return { count: 0, results: [], error: `维基百科查询失败: HTTP ${resp.status}` };
    }
    const data = await resp.json();
    const pages = data?.query?.pages;
    if (!pages) {
      return { count: 0, results: [] };
    }

    const arr = Object.values(pages) as any[];
    arr.sort((a, b) => (a.index ?? 999) - (b.index ?? 999));
    // 用站点根 + /wiki/标题构造 URL（如 https://zh.wikipedia.org/wiki/…），确保返回的 URL 用户可点开。
    const results = arr.slice(0, lim).map((p) => ({
      title: (p.title || '').trim() || '(无标题)',
      url: `${baseClean}/wiki/${encodeURIComponent(p.title || '')}`,
      extract: clip(p.extract || '', WIKIPEDIA_EXTRACT_MAX_CHARS),
    }));

    return { count: results.length, results };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { count: 0, results: [], error: '维基百科查询超时（20s）。' };
    return { count: 0, results: [], error: `维基百科查询出错: ${e?.message || e}` };
  }
}
