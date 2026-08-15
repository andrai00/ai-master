"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { stopProcessing, emitStopped } from "@/src/shared/lib/agents/gm-runner";

export async function stopGameMasterResponseAction(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "errors.forbidden" };

  if (session.role !== "admin") {
    const prisma = getPrisma();
    const s = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { playerId: true, type: true, masterId: true },
    });
    if (!s) return { success: false, error: "errors.forbidden" };
    if (s.type === "personal" && s.playerId !== session.userId) {
      return { success: false, error: "errors.forbidden" };
    }
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId: s.masterId } },
    });
    if (!access) return { success: false, error: "errors.forbidden" };
  }

  stopProcessing(sessionId);
  emitStopped(sessionId);
  broadcastGameEvent("gm_response_stopped", { sessionId });

  return { success: true };
}
