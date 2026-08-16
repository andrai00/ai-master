"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { runGameMasterPersonal } from "@/src/shared/lib/agents/gm-runner";

export async function requestPersonalMasterResponseAction(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "errors.forbidden" };

  const activeGame = await getActiveGame();
  if (!activeGame) return { success: false, error: "errors.noGame" };

  const prisma = getPrisma();

  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { masterId: true, type: true, playerId: true },
  });
  if (!s || s.type !== "personal") return { success: false, error: "errors.sessionNotFound" };

  if (session.role !== "admin") {
    if (s.playerId !== session.userId) {
      return { success: false, error: "errors.forbidden" };
    }
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId: s.masterId } },
    });
    if (!access) return { success: false, error: "errors.noGameAccess" };
  }

  broadcastGameEvent("gm_response_requested", { sessionId });

  const playerId = s.playerId ?? session.userId;
  runGameMasterPersonal(sessionId, playerId).catch((e) => {
    console.error("[gm-personal] Background processing crashed:", e);
  });

  return { success: true };
}
