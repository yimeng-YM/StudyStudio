import type { AIConfig } from '@/db';

/**
 * 联网工具的开关与状态聚合工具。
 *
 * 集中计算 web_search / search_wikipedia / read_url 的可用性，供：
 *   - useChatSession / runSubAgent：决定把哪些工具注入给模型 + 注入状态提示行
 *   - ToolConfigSwitcher（AI 对话界面的工具按钮）：渲染开关、判断搜索是否可用
 *
 * 规则：
 *   - read_url 始终可用（网页读取不受开关控制）。
 *   - web_search 需同时满足「开关打开」且「当前后端的 API Key 已配置」才可用。
 *   - search_wikipedia 默认开启（undefined 视为开），免 Key。
 */

export type SearchBackend = 'jina' | 'serper';

/** 当前选用的搜索后端（缺省回退 jina） */
export function getSearchBackend(c?: AIConfig | null): SearchBackend {
  return c?.webSearchBackend === 'serper' ? 'serper' : 'jina';
}

/** 当前后端对应的 API Key 是否已配置 */
export function isSearchKeyConfigured(c?: AIConfig | null): boolean {
  if (!c) return false;
  const key = getSearchBackend(c) === 'serper' ? c.serperApiKey : c.jinaApiKey;
  return typeof key === 'string' && key.trim().length > 0;
}

/** web_search 是否真正可用：开关已开 且 Key 已配置 */
export function isWebSearchUsable(c?: AIConfig | null): boolean {
  return c?.webSearchEnabled === true && isSearchKeyConfigured(c);
}

/** search_wikipedia 是否启用：默认开启，显式置 false 才关 */
export function isWikipediaOn(c?: AIConfig | null): boolean {
  return c?.wikipediaEnabled !== false;
}

/**
 * 构造注入给模型的「联网工具可用性」提示行。
 * 模型据此知道本轮哪些联网工具可调，避免去调被关闭的工具。
 */
export function buildWebToolsStatus(c?: AIConfig | null): string {
  const ws = isWebSearchUsable(c);
  const wiki = isWikipediaOn(c);
  return [
    '## Web Tools Availability (current session)',
    '- read_url: ENABLED (always available) — reads any web page as clean Markdown.',
    `- web_search: ${ws ? 'ENABLED' : 'DISABLED'}.`,
    `- search_wikipedia: ${wiki ? 'ENABLED' : 'DISABLED'}.`,
    'Only call tools that are ENABLED. If a needed web tool is DISABLED, do NOT attempt to call it; tell the user they can enable it via the tool-config button in the chat (web search also requires an API key configured in Settings).',
  ].join('\n');
}