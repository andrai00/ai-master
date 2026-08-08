import "server-only";
import { EventEmitter } from "events";

export type TGameEvent =
  | "mode_switch"
  | "kick"
  | "builder_mode_change"
  | "game_deleted"
  | "game_switched"
  | "game_created"
  | "game_updated"
  | "builder_message_deleted"
  | "builder_message_sent"
  | "builder_chat_cleared"
  | "file_uploaded"
  | "file_removed"
  | "archive_uploaded"
  | "user_created"
  | "user_updated"
  | "user_deleted"
  | "ai_config_updated"
  | "game_message_sent"
  | "game_message_deleted"
  | "personal_message_sent"
  | "personal_message_deleted";

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

/** Send an event to a specific user by userId (for kick, access-loss notifications). */
export function broadcastToUser(userId: string, type: TGameEvent, payload?: unknown): void {
  getEmitter().emit(`user:${userId}`, { type, payload } as IGameEvent);
}

/** SSE routes call this to subscribe to broadcast events. Returns unsubscribe function. */
export function onGameEvent(listener: TGameEventListener): () => void {
  const emitter = getEmitter();
  emitter.on("event", listener);
  return () => {
    emitter.off("event", listener);
  };
}

/** SSE routes call this to subscribe to events for a specific user. Returns unsubscribe function. */
export function onUserEvent(userId: string, listener: TGameEventListener): () => void {
  const emitter = getEmitter();
  const channel = `user:${userId}`;
  emitter.on(channel, listener);
  return () => {
    emitter.off(channel, listener);
  };
}
