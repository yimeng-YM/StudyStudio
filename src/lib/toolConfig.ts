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
 *   - 总开关需当前后端的 API Key 已配置才真正可用（serper 后端搜索/读取共用同一 Key；jina 后端搜索需 Key）。
 *   - 维基来源：
 *     · search_wikipedia_web（经 Serper 站内搜 wikipedia.org）：国内可用，**无独立开关——联网总开关开启即自带**（isWebUsable）。
 *     · search_wikipedia（原站 wikipedia.org API）：免 Key，但原站被墙，**默认关闭**（挂 VPN 时可手动开启），独立开关、受总开关联动约束。
 */

export type SearchBackend = 'jina' | 'serper';

/** 当前选用的搜索/读取后端（缺省回退 serper——用户要求默认 Serper） */
export function getSearchBackend(c?: AIConfig | null): SearchBackend {
  return c?.webSearchBackend === 'jina' ? 'jina' : 'serper';
}

/** 当前后端对应的 API Key 是否已配置（serper→serperApiKey；jina→jinaApiKey） */
export function isSearchKeyConfigured(c?: AIConfig | null): boolean {
  if (!c) return false;
  const key = getSearchBackend(c) === 'serper' ? c.serperApiKey : c.jinaApiKey;
  return typeof key === 'string' && key.trim().length > 0;
}

/** 联网总开关是否打开（webSearchEnabled） */
export function isWebEnabled(c?: AIConfig | null): boolean {
  return c?.webSearchEnabled === true;
}

/**
 * 联网能力（web_search + read_url）是否真正可用：总开关已开 且 当前后端 Key 已配置。
 * 这是 web_search 与 read_url 的共同注入门槛——二者同步开/关。
 */
export function isWebUsable(c?: AIConfig | null): boolean {
  return isWebEnabled(c) && isSearchKeyConfigured(c);
}

/** 兼容旧名：web_search 是否可用（= 联网能力可用） */
export function isWebSearchUsable(c?: AIConfig | null): boolean {
  return isWebUsable(c);
}

/** 维基百科原站（wikipedia.org API）是否启用：**默认关闭**（原站被墙），需显式开启；且受联网总开关联动约束 */
export function isWikipediaOn(c?: AIConfig | null): boolean {
  return c?.wikipediaEnabled === true && isWebUsable(c);
}

// 注：search_wikipedia_web（经 Serper 站内搜 wikipedia.org）不设独立开关——联网能力可用（isWebUsable）即自带，见 buildWebToolsStatus / 注入过滤。

/**
 * 构造注入给模型的「联网工具可用性」提示行。
 * 模型据此知道本轮哪些联网工具可调，避免去调被关闭的工具；并鼓励对权威百科类问题多源交叉。
 */
export function buildWebToolsStatus(c?: AIConfig | null): string {
  const web = isWebUsable(c);
  const wiki = isWikipediaOn(c);
  const backend = getSearchBackend(c);
  return [
    '## Web Tools Availability (current session)',
    `- web_search: ${web ? 'ENABLED' : 'DISABLED'} (backend: ${backend}).`,
    `- read_url: ${web ? 'ENABLED' : 'DISABLED'} — reads a web page as clean Markdown via the same backend as web_search.`,
    `- search_wikipedia_web: ${web ? 'ENABLED' : 'DISABLED'} — searches wikipedia.org via the Serper web-search backend (site:wikipedia.org). Available whenever web_search is enabled (no separate toggle); China-accessible; returns Wikipedia article links + Google snippets.`,
    `- search_wikipedia: ${wiki ? 'ENABLED' : 'DISABLED'} — original wikipedia.org API. Keyless but the site is blocked in some networks; only usable with VPN there.`,
    `- image_search: ${web ? 'ENABLED' : 'DISABLED'} — searches the web for images via the same backend as web_search. Only works when the backend is Serper (returns an error on Jina).`,
    'Only call tools that are ENABLED. If a needed web tool is DISABLED, do NOT attempt to call it; tell the user they can enable it via the tool-config button in the chat (web search & read also require an API key configured in Settings).',
    'For encyclopedic / authoritative questions, prefer search_wikipedia_web; call read_url on the best Wikipedia URL(s) to ingest the full article, then synthesize. If Chinese-language Wikipedia is unreachable via read_url, prefer the English Wikipedia article and translate the answer to Chinese.',
  ].join('\n');
}