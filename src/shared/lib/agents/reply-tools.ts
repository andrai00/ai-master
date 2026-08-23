/**
 * Per-run action ledger: every tool call the agent makes in the current
 * generation is recorded here, so runners can log what the model actually
 * did (diagnostics) without keyword heuristics.
 */
const actionLedger = new Map<string, string[]>();
const planDone = new Map<string, boolean>();
const reviewDone = new Map<string, boolean>();

export function clearActions(sessionId: string): void {
  actionLedger.delete(sessionId);
  planDone.delete(sessionId);
  reviewDone.delete(sessionId);
}

export function recordActions(sessionId: string, toolCalls: Array<{ toolName?: string }>): void {
  const list = actionLedger.get(sessionId) ?? [];
  for (const c of toolCalls ?? []) {
    if (c.toolName) list.push(c.toolName);
  }
  actionLedger.set(sessionId, list);
}

/** Exposed for diagnostics (gm-game run log). */
export function getActions(sessionId: string): string[] {
  return actionLedger.get(sessionId) ?? [];
}

/** Marks that the model declared a plan via plan_turn this run. */
export function markPlanDone(sessionId: string): void {
  planDone.set(sessionId, true);
}

/** Whether plan_turn was called this run (gate for write/roll tools). */
export function isPlanDone(sessionId: string): boolean {
  return planDone.get(sessionId) ?? false;
}

/** Marks that the model ran review_turn before the final reply. */
export function markReviewDone(sessionId: string): void {
  reviewDone.set(sessionId, true);
}

/** Whether review_turn was called this run. */
export function isReviewDone(sessionId: string): boolean {
  return reviewDone.get(sessionId) ?? false;
}
