import "server-only";
import { getIO } from "@/src/shared/lib/realtime/io";

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
  | "game_chat_cleared"
  | "personal_message_sent"
  | "personal_message_deleted"
  | "personal_chat_cleared"
  | "profile_updated"
  | "gm_response_requested"
  | "gm_response_stopped"
  | "roll_assigned"
  | "roll_completed"
  | "roll_removed"
  | "document_created"
  | "document_updated"
  | "document_deleted";

interface IGameEvent {
  type: TGameEvent;
  payload?: unknown;
}

/** Server Actions call this to broadcast an event to all connected clients. */
export function broadcastGameEvent(type: TGameEvent, payload?: unknown): void {
  getIO().emit("game:event", { type, payload } as IGameEvent);
}

/** Send an event to a specific user by userId (kick, access-loss notifications). */
export function broadcastToUser(userId: string, type: TGameEvent, payload?: unknown): void {
  getIO().to(`user:${userId}`).emit("game:event", { type, payload } as IGameEvent);
}
