/**
 * 处理 Vite 动态导入 chunk 加载失败。
 *
 * 重新部署后旧哈希 chunk 可能消失，浏览器磁盘缓存也可能损坏并抛出
 * ERR_CACHE_READ_FAILURE。恢复时先强制回源并完整消费失败 chunk 的响应，
 * 用新响应替换损坏的 HTTP 缓存条目，再刷新入口文件获取最新哈希。
 */

const RECOVERY_RECORD_KEY = 'studystudio:chunkRecovery';
const RECOVERY_COOLDOWN_MS = 30_000;
const CACHE_REPAIR_TIMEOUT_MS = 8_000;

interface RecoveryRecord {
  signature: string;
  attemptedAt: number;
}

export interface ChunkRecoveryOptions {
  /** 用户主动点击恢复时可绕过短时冷却。 */
  force?: boolean;
}

let memoryRecoveryRecord: RecoveryRecord | null = null;
let recoveryInProgress = false;

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ERR_CACHE_READ_FAILURE/i;

/** 判断错误是否为动态导入 chunk 加载失败 */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as { message?: unknown })?.message ?? String(err);
  return typeof msg === 'string' && CHUNK_ERROR_RE.test(msg);
}

/** 从浏览器的动态导入错误中提取失败的本站 JS 资源 URL。 */
function getFailedChunkUrl(err: unknown): URL | null {
  const msg = (err as { message?: unknown })?.message ?? String(err ?? '');
  if (typeof msg !== 'string') return null;

  const match = msg.match(/https?:\/\/[^\s"'<>]+?\.m?js(?:\?[^\s"'<>]*)?/i);
  if (!match) return null;

  try {
    const url = new URL(match[0]);
    // 避免错误文本诱导应用主动请求任意第三方地址。
    return url.origin === window.location.origin ? url : null;
  } catch {
    return null;
  }
}

function readRecoveryRecord(): RecoveryRecord | null {
  try {
    const raw = sessionStorage.getItem(RECOVERY_RECORD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecoveryRecord>;
    if (typeof parsed.signature === 'string' && typeof parsed.attemptedAt === 'number') {
      return parsed as RecoveryRecord;
    }
  } catch {
    return memoryRecoveryRecord;
  }
  return null;
}

function writeRecoveryRecord(record: RecoveryRecord): void {
  memoryRecoveryRecord = record;
  try {
    sessionStorage.setItem(RECOVERY_RECORD_KEY, JSON.stringify(record));
  } catch {
    // sessionStorage 不可用时由内存记录兜底。
  }
}

/**
 * 绕过损坏的 HTTP 磁盘缓存重新下载完整 chunk。
 * 必须消费完整响应体，否则浏览器可能不会替换旧缓存条目。
 */
async function repairChunkCache(url: URL): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CACHE_REPAIR_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      cache: 'reload',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Chunk cache repair failed: HTTP ${response.status}`);
    }
    await response.arrayBuffer();
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 若错误属于 chunk 加载失败，先修复对应缓存，再带缓存破坏参数刷新入口。
 * 同一资源 30 秒内只自动恢复一次，防止服务器确实异常时形成刷新循环。
 */
export async function reloadOnChunkError(
  err: unknown,
  options: ChunkRecoveryOptions = {},
): Promise<boolean> {
  if (!isChunkLoadError(err)) return false;
  if (recoveryInProgress) return true;

  const failedUrl = getFailedChunkUrl(err);
  const message = (err as { message?: unknown })?.message ?? String(err);
  const signature = failedUrl?.pathname || String(message).slice(0, 240);
  const previous = readRecoveryRecord();
  const now = Date.now();

  if (!options.force && previous?.signature === signature && now - previous.attemptedAt < RECOVERY_COOLDOWN_MS) {
    return false;
  }

  recoveryInProgress = true;
  writeRecoveryRecord({ signature, attemptedAt: now });

  if (failedUrl) {
    try {
      await repairChunkCache(failedUrl);
    } catch (repairError) {
      // 旧 chunk 在新部署中已不存在时会返回 404；仍应刷新入口获取最新哈希。
      console.warn('[chunk recovery] 强制回源失败，将刷新入口文件：', repairError);
    }
  }

  try {
    const pageUrl = new URL(window.location.href);
    pageUrl.searchParams.set('_rc', String(Date.now()));
    window.location.replace(pageUrl.toString());
  } catch {
    window.location.reload();
  }
  return true;
}
