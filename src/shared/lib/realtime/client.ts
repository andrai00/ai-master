"use client";

import { io, type Socket } from "socket.io-client";

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

export interface ITypingIndicator {
  sessionId: string;
  userId: string;
  displayName: string;
  typing: boolean;
}

export interface IPresenceUser {
  userId: string;
  displayName: string;
  role: string;
}

export interface IPresenceUpdate {
  masterId: string;
  online: IPresenceUser[];
}

interface ISessionState {
  processing: boolean;
  tool?: string;
  detail?: string;
  args?: string;
}

type StepHandler = (event: IRealtimeStepEvent) => void;
type ReconnectHandler = () => void;
type TypingHandler = (indicator: ITypingIndicator) => void;
type PresenceHandler = (update: IPresenceUpdate) => void;

// Single Socket.IO connection shared by the whole app (module-level singleton).
// Reset automatically on a full page load; reconnect handled by socket.io.
let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    // (Re)join the step rooms the app is currently subscribed to whenever the
    // socket connects/reconnects. This repairs membership that was lost when
    // a chat session was created lazily after the first connect (the room was
    // never joined) or when the connection dropped mid-run.
    socket.on("connect", () => {
      for (const sessionId of pendingStepRooms) {
        socket?.emit("subscribe-steps", { sessionId });
      }
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

const stepListeners = new Map<string, Set<StepHandler>>();
const sessionState = new Map<string, ISessionState>();
const reconnectListeners = new Set<ReconnectHandler>();
const typingListeners = new Map<string, Set<TypingHandler>>();
const presenceListeners = new Set<PresenceHandler>();
const pendingStepRooms = new Set<string>();
let latestPresence: IPresenceUpdate | null = null;

export function subscribeStep(sessionId: string, handler: StepHandler): () => void {
  let set = stepListeners.get(sessionId);
  if (!set) {
    set = new Set();
    stepListeners.set(sessionId, set);
  }
  set.add(handler);

  requestStepRoom(sessionId);

  // Replay current state to a late subscriber (page loaded mid-batch).
  const state = sessionState.get(sessionId);
  if (state?.processing) {
    handler({ sessionId, type: "started" });
    if (state.tool) handler({ sessionId, type: "step", tool: state.tool, detail: state.detail });
  }

  return () => {
    set.delete(handler);
    if (set.size === 0) {
      stepListeners.delete(sessionId);
      releaseStepRoom(sessionId);
    }
  };
}

/** Ask the server to join this socket to the steps/session rooms for the chat. */
function requestStepRoom(sessionId: string): void {
  pendingStepRooms.add(sessionId);
  socket?.emit("subscribe-steps", { sessionId });
}

/** Leave the steps/session rooms for a chat the client is no longer viewing. */
function releaseStepRoom(sessionId: string): void {
  pendingStepRooms.delete(sessionId);
  socket?.emit("unsubscribe-steps", { sessionId });
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

export function subscribeTyping(sessionId: string, handler: TypingHandler): () => void {
  let set = typingListeners.get(sessionId);
  if (!set) {
    set = new Set();
    typingListeners.set(sessionId, set);
  }
  set.add(handler);
  return () => {
    set.delete(handler);
    if (set.size === 0) typingListeners.delete(sessionId);
  };
}

/** Incoming typing indicator from the server (dispatched by the Shell). */
export function dispatchTypingIndicator(indicator: ITypingIndicator): void {
  const set = typingListeners.get(indicator.sessionId);
  if (!set) return;
  for (const h of [...set]) h(indicator);
}

/** Send a typing intent for a chat session to the server. */
export function notifyTyping(sessionId: string, typing: boolean): void {
  socket?.emit(typing ? "typing:start" : "typing:stop", { sessionId });
}

export function subscribePresence(handler: PresenceHandler): () => void {
  presenceListeners.add(handler);
  // Replay the last known presence snapshot so a (re)mounted consumer
  // (e.g. sidebar on page navigation) shows online users immediately.
  if (latestPresence) handler(latestPresence);
  return () => {
    presenceListeners.delete(handler);
  };
}

/** Incoming presence snapshot from the server (dispatched by the Shell). */
export function dispatchPresence(update: IPresenceUpdate): void {
  latestPresence = update;
  for (const h of [...presenceListeners]) h(update);
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
