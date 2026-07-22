import "server-only";
import { EventEmitter } from "events";

export type TGameEvent = "mode_switch" | "kick";

interface IGameEvent {
  type: TGameEvent;
  payload?: unknown;
}

type TGameEventListener = (event: IGameEvent) => void;

const globalEvents = globalThis as unknown as {
  emitter: EventEmitter | undefined;
};

function getEmitter(): EventEmitter {
  if (!globalEvents.emitter) {
    globalEvents.emitter = new EventEmitter();
    globalEvents.emitter.setMaxListeners(100);
  }
  return globalEvents.emitter;
}

/** Server Actions call this to broadcast an event to all SSE-connected clients. */
export function broadcastGameEvent(type: TGameEvent, payload?: unknown): void {
  getEmitter().emit("event", { type, payload } as IGameEvent);
}

/** SSE routes call this to subscribe. Returns unsubscribe function. */
export function onGameEvent(listener: TGameEventListener): () => void {
  const emitter = getEmitter();
  emitter.on("event", listener);
  return () => {
    emitter.off("event", listener);
  };
}
