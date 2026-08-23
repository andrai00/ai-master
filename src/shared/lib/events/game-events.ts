import "server-only";
import { getIO } from "@/src/shared/lib/realtime/io";
import type { IMessagePayload } from "./message-payload";

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

/**
 * Builds the socket message payload right after `prisma.message.create`.
 * `created` is the row returned by the create with `include: { sender: true }`.
 */
export function toMessagePayload(
  created: {
    id: string;
    role: string;
    content: string;
    senderId: string;
    shared: boolean;
    summarized: boolean;
    hasFiles: boolean;
    attachedFiles: string;
    runId: string | null;
    createdAt: Date;
    sender: { displayName: string; avatar: string } | null;
  }
): IMessagePayload {
  let attachedFiles: { fileId: string; filename: string }[] = [];
  try {
    attachedFiles = JSON.parse(created.attachedFiles || "[]") as { fileId: string; filename: string }[];
  } catch {
    // keep empty list
  }
  return {
    id: created.id,
    role: created.role,
    content: created.content,
    senderId: created.senderId,
    senderDisplayName: created.sender?.displayName ?? "",
    senderAvatar: created.sender?.avatar ?? "",
    shared: created.shared,
    summarized: created.summarized,
    hasFiles: created.hasFiles,
    attachedFiles,
    runId: created.runId,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * Broadcasts a chat message together with its full serializable payload, so
 * clients can insert it into the message list instantly without a DB refetch.
 */
export function broadcastMessageCreated(
  type: TGameEvent,
  sessionId: string,
  created: Parameters<typeof toMessagePayload>[0]
): void {
  broadcastGameEvent(type, { sessionId, message: toMessagePayload(created) } as {
    sessionId: string;
    message: IMessagePayload;
  });
}
