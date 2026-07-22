import "server-only";

/**
 * Global cancellation for builder agent processing.
 * When Stop is clicked, cancelAll() is called.
 * Tools check isCancelled() before executing.
 */

const globalCancelled = globalThis as unknown as {
  cancelled: boolean | undefined;
};

/** Cancel ALL pending processing. Called by stop action. */
export function cancelAll(): void { globalCancelled.cancelled = true; }

/** Reset cancellation. Called when new processing starts. */
export function resetCancellation(): void { globalCancelled.cancelled = false; }

/** Check if processing was cancelled. All tools must call this before executing. */
export function isCancelled(): boolean { return globalCancelled.cancelled === true; }

/**
 * Throw if cancelled. Use in tools and runner to abort immediately.
 * Uses DOMException AbortError — the AI SDK recognizes this and stops the loop.
 */
export function throwIfCancelled(): void {
  if (globalCancelled.cancelled) {
    throw new DOMException("Cancelled.", "AbortError");
  }
}
