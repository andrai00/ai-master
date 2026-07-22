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

/** Cancel ALL pending file parsing. Called by stop action. */
export function cancelAllFileParsing(): void {
  globalCancelled.allCancelled = true;
}

/** Reset cancellation state. Called when new processing starts. */
export function resetCancellation(): void {
  globalCancelled.allCancelled = false;
  getCancelled().clear();
}

/** Check if file parsing was cancelled. */
export function isFileParsingCancelled(_fileId: string): boolean {
  return globalCancelled.allCancelled === true || getCancelled().has(_fileId);
}
