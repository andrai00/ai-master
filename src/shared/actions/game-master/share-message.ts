"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export async function shareMessageAction(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "errors.forbidden" };

  const activeGame = await getActiveGame();
  if (!activeGame) return { success: false, error: "errors.noGame" };

  const prisma = getPrisma();

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      sessionId: true,
      senderId: true,
      role: true,
      content: true,
    },
  });
  if (!msg) return { success: false, error: "errors.messageNotFound" };

  const personalSession = await prisma.session.findUnique({
    where: { id: msg.sessionId },
    select: { type: true, playerId: true, masterId: true },
  });
  if (!personalSession || personalSession.type !== "personal") {
    return { success: false, error: "errors.sessionNotFound" };
  }
  if (personalSession.masterId !== activeGame.currentMasterId) {
    return { success: false, error: "errors.wrongGame" };
  }

  if (session.role !== "admin" && personalSession.playerId !== session.userId) {
    return { success: false, error: "errors.forbidden" };
  }

  const gameSession = await prisma.session.findFirst({
    where: { masterId: activeGame.currentMasterId, type: "game" },
    select: { id: true },
  });
  if (!gameSession) return { success: false, error: "errors.sessionNotFound" };

  await prisma.message.create({
    data: {
      sessionId: gameSession.id,
      senderId: msg.senderId,
      role: msg.role,
      content: msg.content,
      shared: true,
    },
  });

  broadcastGameEvent("game_message_sent", { sessionId: gameSession.id });

  return { success: true };
}
