import "server-only";
import { EventEmitter } from "events";
import { debugLog } from "@/src/shared/lib/debug-log";

export type TStepEventType = "started" | "step" | "done" | "error" | "stopping" | "stopped";

export interface IStepEvent {
  type: TStepEventType;
  tool?: string;
  detail?: string;
  message?: string;
  seq: number;
}

export interface ISessionSnapshot {
  processing: boolean;
  tool?: string;
  detail?: string;
  seq: number;
}

const globalState = globalThis as unknown as {
  sessions: Map<string, ISessionSnapshot> | undefined;
  emitter: EventEmitter | undefined;
};

function getMap(): Map<string, ISessionSnapshot> {
  if (!globalState.sessions) globalState.sessions = new Map();
  return globalState.sessions;
}

function getEmitter(): EventEmitter {
  if (!globalState.emitter) {
    globalState.emitter = new EventEmitter();
    globalState.emitter.setMaxListeners(100);
  }
  return globalState.emitter;
}

export function initSession(sessionId: string): void {
  getMap().set(sessionId, { processing: false, seq: 0 });
}

function emit(sessionId: string, event: Omit<IStepEvent, "seq">): void {
  const s = getMap().get(sessionId);
  if (!s) {
    debugLog("step-tracker", "emit DROPPED (no session state)", { sessionId, type: event.type, tool: event.tool });
    return;
  }
  s.seq++;
  const full: IStepEvent = { ...event, seq: s.seq };

  switch (event.type) {
    case "started":
      s.processing = true;
      s.tool = undefined;
      break;
    case "step":
      s.processing = true;
      s.tool = event.tool;
      s.detail = event.detail;
      break;
    case "stopping":
      s.processing = true;
      s.tool = undefined;
      break;
    case "done":
    case "stopped":
    case "error":
      s.processing = false;
      break;
  }

  debugLog("step-tracker", "emit", { sessionId: sessionId.slice(0, 8), type: full.type, tool: full.tool, detail: full.detail, seq: full.seq });
  getEmitter().emit("step", sessionId, full);

  // Deterministic cleanup: terminal states remove the snapshot.
  if (event.type === "done" || event.type === "stopped" || event.type === "error") {
    getMap().delete(sessionId);
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

export function getSnapshot(sessionId: string): ISessionSnapshot | undefined {
  return getMap().get(sessionId);
}

/** Subscribe to step events for real-time push. Returns unsubscribe function. */
export function onStep(
  sessionId: string,
  handler: (event: IStepEvent) => void,
): () => void {
  const emitter = getEmitter();
  const wrapped = (sid: string, event: IStepEvent) => {
    if (sid === sessionId) handler(event);
  };
  emitter.on("step", wrapped);
  return () => {
    emitter.off("step", wrapped);
  };
}
