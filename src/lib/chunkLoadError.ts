/**
 * 处理 Vite 动态导入 chunk 加载失败。
 *
 * 典型场景：重新部署后，旧的带哈希 chunk（如 mermaid 懒加载的 ganttDiagram-xxxx.js）
 * 已从服务器删除，但浏览器仍持有引用旧哈希的 index.js，或本地缓存损坏
 * (ERR_CACHE_READ_FAILURE)，导致动态 import() 抛出
 * "Failed to fetch dynamically imported module"。
 *
 * 策略：检测到此类错误时，带缓存破坏参数刷新一次页面，强制重新拉取最新的
 * index.html（含最新 chunk 哈希）。每个标签页会话只自动刷新一次——若刷新后仍失败
 * （如部署确实损坏），不再重试，避免无限刷新；用户可手动硬刷新或新开标签页恢复。
 */

const RELOAD_FLAG = 'studystudio:chunkReloadDone';
// sessionStorage 不可用时的内存兜底标志
let reloadedRef = false;

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ERR_CACHE_READ_FAILURE/i;

/** 判断错误是否为动态导入 chunk 加载失败 */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as { message?: unknown })?.message ?? String(err);
  return typeof msg === 'string' && CHUNK_ERROR_RE.test(msg);
}

/**
 * 若错误属于 chunk 加载失败，则带缓存破坏参数刷新页面一次。
 * @returns 是否触发了刷新（true 表示即将跳转，调用方应停止后续处理）
 */
export function reloadOnChunkError(err: unknown): boolean {
  if (!isChunkLoadError(err)) return false;

  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    if (reloadedRef) return false;
    reloadedRef = true;
  }

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_rc', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
  return true;
}