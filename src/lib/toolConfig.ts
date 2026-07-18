import type { AIConfig } from '@/db';

/**
 * 联网工具的开关与状态聚合工具。
 *
 * 集中计算各联网工具的可用性，供：
 *   - useChatSession / runSubAgent：决定把哪些工具注入给模型 + 注入状态提示行
 *   - ToolConfigSwitcher（AI 对话界面的工具按钮）：渲染开关、判断可用性
 *   - AdvancedSettings：渲染搜索后端与各 Key 配置
 *
 * 开关模型（用户设计）：
 *   - 「联网搜索 + 网页读取」为一个**总开关**（webSearchEnabled），同步控制 web_search 与 read_url。
 *   - 总开关需当前后端配置完成才真正可用（本地后端免 Key；Serper/Jina 需要对应 Key）。
 *   - 维基来源：
 *     · search_wikipedia_web（经当前搜索后端站内搜 wikipedia.org）：**无独立开关——联网总开关开启即自带**（isWebUsable）。
 *     · search_wikipedia（原站 wikipedia.org API）：免 Key，但原站被墙，**默认关闭**（挂 VPN 时可手动开启），独立开关、受总开关联动约束。
 */

export type SearchBackend = 'local' | 'jina' | 'serper';

const pageRunsLocally = typeof window === 'undefined'
  || window.location.hostname === 'localhost'
  || window.location.hostname === '127.0.0.1';

/**
 * Local development uses Vite's /api proxy. A deployed frontend calls the
 * search service running on the visitor's own computer.
 */
export const DEFAULT_LOCAL_SEARCH_BASE_URL = (
  (import.meta.env.VITE_LOCAL_SEARCH_BASE_URL as string | undefined)?.trim()
  || (pageRunsLocally ? '/api' : 'http://127.0.0.1:17890/api')
).replace(/\/+$/, '');

/** 当前选用的搜索/读取后端；未保存偏好时默认使用本地服务。 */
export function getSearchBackend(c?: AIConfig | null): SearchBackend {
  if (c?.webSearchBackend === 'serper') return 'serper';
  if (c?.webSearchBackend === 'jina') return 'jina';
  return 'local';
}

/** 获取本地 Gateway API 根地址；空值回退同源 /api。 */
export function getLocalSearchBaseUrl(c?: AIConfig | null): string {
  const configured = c?.localSearchBaseUrl?.trim();
  // `/api` is the local Vite proxy. On a public deployment it would point to
  // Vercel itself, so migrate that old value to the visitor's loopback service.
  const raw = configured === '/api' && DEFAULT_LOCAL_SEARCH_BASE_URL !== '/api'
    ? DEFAULT_LOCAL_SEARCH_BASE_URL
    : configured || DEFAULT_LOCAL_SEARCH_BASE_URL;
  return raw.replace(/\/+$/, '') || DEFAULT_LOCAL_SEARCH_BASE_URL;
}

/** 当前搜索后端是否已配置完成（本地后端免 Key）。 */
export function isSearchBackendConfigured(c?: AIConfig | null): boolean {
  if (!c) return false;
  const backend = getSearchBackend(c);
  if (backend === 'local') return getLocalSearchBaseUrl(c).length > 0;
  const key = backend === 'serper' ? c.serperApiKey : c.jinaApiKey;
  return typeof key === 'string' && key.trim().length > 0;
}

/** @deprecated 兼容旧调用方；语义现为“当前后端已配置”。 */
export const isSearchKeyConfigured = isSearchBackendConfigured;

/** 联网总开关是否打开（webSearchEnabled） */
export function isWebEnabled(c?: AIConfig | null): boolean {
  return c?.webSearchEnabled === true;
}

/**
 * 联网能力（web_search + read_url）是否真正可用：总开关已开 且 当前后端配置完成。
 * 这是 web_search 与 read_url 的共同注入门槛——二者同步开/关。
 */
export function isWebUsable(c?: AIConfig | null): boolean {
  return isWebEnabled(c) && isSearchBackendConfigured(c);
}

/** 兼容旧名：web_search 是否可用（= 联网能力可用） */
export function isWebSearchUsable(c?: AIConfig | null): boolean {
  return isWebUsable(c);
}

/** 维基百科原站（wikipedia.org API）是否启用：**默认关闭**（原站被墙），需显式开启；且受联网总开关联动约束 */
export function isWikipediaOn(c?: AIConfig | null): boolean {
  return c?.wikipediaEnabled === true && isWebUsable(c);
}

/** 图片搜索在本地 SearXNG 与 Serper 后端可用；Jina 无对应能力。 */
export function isImageSearchUsable(c?: AIConfig | null): boolean {
  return isWebUsable(c) && getSearchBackend(c) !== 'jina';
}

// 注：search_wikipedia_web（经当前后端站内搜 wikipedia.org）不设独立开关——联网能力可用（isWebUsable）即自带。

/**
 * 构造注入给模型的「联网工具可用性」提示行。
 * 模型据此知道本轮哪些联网工具可调，避免去调被关闭的工具；并鼓励对权威百科类问题多源交叉。
 */
export function buildWebToolsStatus(c?: AIConfig | null): string {
  const web = isWebUsable(c);
  const wiki = isWikipediaOn(c);
  const images = isImageSearchUsable(c);
  const backend = getSearchBackend(c);
  return [
    '## Web Tools Availability (current session)',
    `- web_search: ${web ? 'ENABLED' : 'DISABLED'} (backend: ${backend}).`,
    `- read_url: ${web ? 'ENABLED' : 'DISABLED'} — reads a web page as clean Markdown via the same backend as web_search.`,
    `- search_wikipedia_web: ${web ? 'ENABLED' : 'DISABLED'} — searches wikipedia.org through the configured backend (site:wikipedia.org). Available whenever web_search is enabled (no separate toggle).`,
    `- search_wikipedia: ${wiki ? 'ENABLED' : 'DISABLED'} — original wikipedia.org API. Keyless but the site is blocked in some networks; only usable with VPN there.`,
    `- image_search: ${images ? 'ENABLED' : 'DISABLED'} — searches the web for images. Available with the local SearXNG or Serper backend; unavailable on Jina.`,
    'Only call tools that are ENABLED. If a needed web tool is DISABLED, do NOT attempt to call it; tell the user they can enable it via the tool-config button in the chat (the selected backend must also be configured in Settings).',
    'For encyclopedic / authoritative questions, prefer search_wikipedia_web; call read_url on the best Wikipedia URL(s) to ingest the full article, then synthesize. If Chinese-language Wikipedia is unreachable via read_url, prefer the English Wikipedia article and translate the answer to Chinese.',
  ].join('\n');
}
