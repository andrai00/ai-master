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
 * Throw if cancelled. Use OUTSIDE tool execute functions (e.g., in builder-runner.ts).
 * In tools, use `isCancelled()` + `throw new Error("errors.cancelled")` instead —
 * AbortError thrown inside a tool's execute is caught by the AI SDK as a tool result
 * and does NOT propagate to abort generateText.
 */
export function throwIfCancelled(): void {
  if (globalCancelled.cancelled) {
    throw new DOMException("errors.cancelled", "AbortError");
  }
}
