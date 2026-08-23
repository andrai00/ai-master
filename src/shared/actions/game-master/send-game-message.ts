"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastMessageCreated } from "@/src/shared/lib/events/game-events";
import { isProcessing } from "@/src/shared/lib/agents/gm-runner";

export async function sendGameMessageAction(
  sessionId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "errors.forbidden" };
  if (!content.trim()) return { success: false, error: "errors.emptyMessage" };

  if (isProcessing(sessionId)) return { success: false, error: "chat.processingBlocked" };

  const activeGame = await getActiveGame();
  if (!activeGame) return { success: false, error: "errors.noGame" };

  const prisma = getPrisma();

  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { masterId: true, type: true },
  });
  if (!s || s.type !== "game") return { success: false, error: "errors.sessionNotFound" };

  if (activeGame.mode !== "game") return { success: false, error: "errors.devModeDisabled" };

  if (session.role !== "admin") {
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId: s.masterId } },
    });
    if (!access) return { success: false, error: "errors.noGameAccess" };
  }

  const created = await prisma.message.create({
    data: {
      sessionId,
      senderId: session.userId,
      role: session.role,
      content: content.trim(),
    },
    include: { sender: { select: { displayName: true, avatar: true } } },
  });

  broadcastMessageCreated("game_message_sent", sessionId, created);

  return { success: true };
}
