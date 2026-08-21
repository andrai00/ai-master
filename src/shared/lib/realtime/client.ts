"use client";

export type TStepEventType = "started" | "step" | "done" | "error" | "stopping" | "stopped" | "text";

export interface IRealtimeStepEvent {
  sessionId: string;
  type: TStepEventType;
  tool?: string;
  detail?: string;
  args?: string;
  message?: string;
  seq?: number;
}

interface ISessionState {
  processing: boolean;
  tool?: string;
  detail?: string;
  args?: string;
}

type StepHandler = (event: IRealtimeStepEvent) => void;
type ReconnectHandler = () => void;

const stepListeners = new Map<string, Set<StepHandler>>();
const sessionState = new Map<string, ISessionState>();
const reconnectListeners = new Set<ReconnectHandler>();

export function subscribeStep(sessionId: string, handler: StepHandler): () => void {
  let set = stepListeners.get(sessionId);
  if (!set) {
    set = new Set();
    stepListeners.set(sessionId, set);
  }
  set.add(handler);

  // Replay current state to a late subscriber (page loaded mid-batch).
  const state = sessionState.get(sessionId);
  if (state?.processing) {
    handler({ sessionId, type: "started" });
    if (state.tool) handler({ sessionId, type: "step", tool: state.tool, detail: state.detail });
  }

  return () => {
    set.delete(handler);
    if (set.size === 0) stepListeners.delete(sessionId);
  };
}

export function emitStep(sessionId: string, event: IRealtimeStepEvent): void {
  switch (event.type) {
    case "started":
      sessionState.set(sessionId, { processing: true });
      break;
    case "step":
      sessionState.set(sessionId, { processing: true, tool: event.tool, detail: event.detail });
      break;
    case "text":
      sessionState.set(sessionId, { processing: true, detail: event.detail });
      break;
    case "stopping":
      sessionState.set(sessionId, { processing: true });
      break;
    case "done":
    case "stopped":
    case "error":
      sessionState.delete(sessionId);
      break;
  }

  const set = stepListeners.get(sessionId);
  if (!set) return;
  for (const h of [...set]) h(event);
}

export function subscribeReconnect(handler: ReconnectHandler): () => void {
  reconnectListeners.add(handler);
  return () => {
    reconnectListeners.delete(handler);
  };
}

export function emitReconnect(): void {
  for (const h of [...reconnectListeners]) h();
}

type DocDeletedHandler = (documentId: string) => void;

const docDeletedListeners = new Set<DocDeletedHandler>();

export function subscribeDocumentDeleted(handler: DocDeletedHandler): () => void {
  docDeletedListeners.add(handler);
  return () => {
    docDeletedListeners.delete(handler);
  };
}

export function emitDocumentDeleted(documentId: string): void {
  for (const h of [...docDeletedListeners]) h(documentId);
}
