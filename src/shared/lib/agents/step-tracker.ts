import "server-only";

/** Per-session step tracking for real-time UI updates. */

interface ISessionSteps {
  steps: string[]; // tool names in order
  done: boolean;
  lastError: string;
}

const globalSteps = globalThis as unknown as {
  sessionSteps: Map<string, ISessionSteps> | undefined;
};

function getMap(): Map<string, ISessionSteps> {
  if (!globalSteps.sessionSteps) {
    globalSteps.sessionSteps = new Map();
  }
  return globalSteps.sessionSteps;
}

export function initSessionSteps(sessionId: string): void {
  getMap().set(sessionId, { steps: [], done: false, lastError: "" });
}

export function addStep(sessionId: string, tool: string): void {
  const s = getMap().get(sessionId);
  if (s) s.steps.push(tool);
}

export function finishSteps(sessionId: string): void {
  const s = getMap().get(sessionId);
  if (s) s.done = true;
}

export function failSteps(sessionId: string, error: string): void {
  const s = getMap().get(sessionId);
  if (s) {
    s.done = true;
    s.lastError = error;
  }
}

export function getSteps(sessionId: string): ISessionSteps | undefined {
  return getMap().get(sessionId);
}

export function clearSteps(sessionId: string): void {
  getMap().delete(sessionId);
}
