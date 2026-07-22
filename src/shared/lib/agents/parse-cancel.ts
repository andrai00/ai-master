import "server-only";

/** Global set of cancelled file parse tasks. */
const globalCancelled = globalThis as unknown as {
  cancelled: Set<string> | undefined;
  allCancelled: boolean | undefined;
};
function getCancelled(): Set<string> {
  if (!globalCancelled.cancelled) globalCancelled.cancelled = new Set();
  return globalCancelled.cancelled;
}
/** Cancel ALL pending processing. Called by stop action. */
export function cancelAll(): void { globalCancelled.allCancelled = true; }
/** Reset cancellation. Called when new processing starts. */
export function resetCancellation(): void { globalCancelled.allCancelled = false; getCancelled().clear(); }
/** Check if processing was cancelled. All tools must call this. */
export function isCancelled(): boolean { return globalCancelled.allCancelled === true; }
