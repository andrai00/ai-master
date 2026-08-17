/**
 * Per-run action ledger: every tool call the agent makes in the current
 * generation is recorded here, so runners can log what the model actually
 * did (diagnostics) without keyword heuristics.
 */
const actionLedger = new Map<string, string[]>();

export function clearActions(sessionId: string): void {
  actionLedger.delete(sessionId);
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
