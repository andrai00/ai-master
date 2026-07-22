import "server-only";

export interface ICachedFile {
  id: string;
  filename: string;
  text: string;
  size: number;
  expiresAt: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes

const globalCache = globalThis as unknown as {
  fileCache: Map<string, ICachedFile> | undefined;
  cleanupTimer: ReturnType<typeof setInterval> | undefined;
};

function getCache(): Map<string, ICachedFile> {
  if (!globalCache.fileCache) {
    globalCache.fileCache = new Map();
  }
  return globalCache.fileCache;
}

function startCleanup(): void {
  if (globalCache.cleanupTimer) return;
  globalCache.cleanupTimer = setInterval(() => {
    const now = Date.now();
    const cache = getCache();
    for (const [id, file] of cache) {
      if (file.expiresAt < now) cache.delete(id);
    }
  }, 60_000); // cleanup every minute
}

/** Store a parsed file in the cache. Returns the file ID. */
export function cacheFile(filename: string, text: string, size: number): string {
  startCleanup();
  const id = crypto.randomUUID();
  getCache().set(id, {
    id,
    filename,
    text,
    size,
    expiresAt: Date.now() + TTL_MS,
  });
  return id;
}

/** Get a cached file by ID. Returns undefined if expired or missing. */
export function getCachedFile(id: string): ICachedFile | undefined {
  const file = getCache().get(id);
  if (!file) return undefined;
  if (file.expiresAt < Date.now()) {
    getCache().delete(id);
    return undefined;
  }
  return file;
}

/** Remove a file from cache. */
export function removeCachedFile(id: string): void {
  getCache().delete(id);
}

/** List all cached files (id, filename, size). */
export function listCachedFiles(): Pick<ICachedFile, "id" | "filename" | "size">[] {
  startCleanup();
  const now = Date.now();
  const cache = getCache();
  const result: Pick<ICachedFile, "id" | "filename" | "size">[] = [];
  for (const [, file] of cache) {
    if (file.expiresAt >= now) {
      result.push({ id: file.id, filename: file.filename, size: file.size });
    }
  }
  return result;
}
