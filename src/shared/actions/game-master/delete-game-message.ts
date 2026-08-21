"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { cascadeDeleteMessageRun } from "@/src/shared/lib/agents/transcript";

export async function deleteGameMessageAction(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  const prisma = getPrisma();
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, sessionId: true, summarized: true },
  });

  if (!msg) return { success: false, error: "errors.messageNotFound" };
  if (msg.summarized) return { success: false, error: "errors.cannotDeleteSummarized" };

  await cascadeDeleteMessageRun(messageId);
  await prisma.message.delete({ where: { id: messageId } });

  broadcastGameEvent("game_message_deleted", { sessionId: msg.sessionId });

  return { success: true };
}
