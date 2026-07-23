import "server-only";

export type TStepEventType = "started" | "step" | "done" | "error" | "stopping" | "stopped";

export interface IStepEvent {
  type: TStepEventType;
  tool?: string;
  detail?: string;
  message?: string;
  seq: number;
}

interface ISessionState {
  events: IStepEvent[];
  seq: number;
}

const globalState = globalThis as unknown as {
  sessions: Map<string, ISessionState> | undefined;
};

function getMap(): Map<string, ISessionState> {
  if (!globalState.sessions) globalState.sessions = new Map();
  return globalState.sessions;
}

export function initSession(sessionId: string): void {
  getMap().set(sessionId, { events: [], seq: 0 });
}

function emit(sessionId: string, event: Omit<IStepEvent, "seq">): void {
  const s = getMap().get(sessionId);
  if (s) {
    s.seq++;
    s.events.push({ ...event, seq: s.seq });
  }
}

export function emitStarted(sessionId: string): void {
  emit(sessionId, { type: "started" });
}

export function emitStep(sessionId: string, tool: string, detail?: string): void {
  emit(sessionId, { type: "step", tool, detail });
}

export function emitDone(sessionId: string): void {
  emit(sessionId, { type: "done" });
}

export function emitError(sessionId: string, message: string): void {
  emit(sessionId, { type: "error", message });
}

export function emitStopping(sessionId: string): void {
  emit(sessionId, { type: "stopping" });
}

export function emitStopped(sessionId: string): void {
  emit(sessionId, { type: "stopped" });
}

export function getEvents(sessionId: string): ISessionState | undefined {
  return getMap().get(sessionId);
}

export function clearSession(sessionId: string): void {
  getMap().delete(sessionId);
}
