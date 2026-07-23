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
export function cacheFile(filename: string, text: string, size: number): string;
/** Store a parsed file with a pre-generated ID (used for async uploads). */
export function cacheFile(id: string, text: string, size: number, filename: string): void;
export function cacheFile(idOrFilename: string, textOrId: string, sizeOrText: number, maybeFilename?: string): string | void {
  startCleanup();
  
  // Overload 2: pre-generated ID
  if (typeof maybeFilename === "string") {
    getCache().set(idOrFilename, {
      id: idOrFilename,
      filename: maybeFilename,
      text: textOrId,
      size: sizeOrText,
      expiresAt: Date.now() + TTL_MS,
    });
    return;
  }
  
  // Overload 1: auto-generate ID
  const id = crypto.randomUUID();
  getCache().set(id, {
    id,
    filename: idOrFilename,
    text: textOrId,
    size: sizeOrText,
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

/** Remove specific files from cache. */
export function removeCachedFiles(ids: string[]): void {
  const cache = getCache();
  const errMap = getErrorCache();
  for (const id of ids) {
    cache.delete(id);
    errMap.delete(id);
  }
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

// ---- Parse error tracking ----

const globalParseErrors = globalThis as unknown as {
  parseErrors: Map<string, string> | undefined;
};

function getErrorCache(): Map<string, string> {
  if (!globalParseErrors.parseErrors) globalParseErrors.parseErrors = new Map();
  return globalParseErrors.parseErrors;
}

/** Store a parse error for a file ID (when background parsing fails). */
export function setFileParseError(fileId: string, error: string): void {
  getErrorCache().set(fileId, error);
}

/** Get the parse error for a file ID, or undefined if none. */
export function getFileParseError(fileId: string): string | undefined {
  return getErrorCache().get(fileId);
}
