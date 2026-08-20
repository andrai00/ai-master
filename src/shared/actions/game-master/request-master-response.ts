"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { runGameMasterBatch } from "@/src/shared/lib/agents/gm-runner";

export async function requestMasterResponseAction(
  sessionId: string,
  planMode = false
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "errors.forbidden" };

  const activeGame = await getActiveGame();
  if (!activeGame || activeGame.mode !== "game") return { success: false, error: "errors.notInGameMode" };

  const prisma = getPrisma();

  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { masterId: true, type: true },
  });
  if (!s || s.type !== "game") return { success: false, error: "errors.sessionNotFound" };

  if (session.role !== "admin") {
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId: s.masterId } },
    });
    if (!access) return { success: false, error: "errors.noGameAccess" };
  }

  broadcastGameEvent("gm_response_requested", { sessionId });

  runGameMasterBatch(sessionId, { planMode }).catch((e) => {
    console.error("[gm-game] Background batch processing crashed:", e);
  });

  return { success: true };
}
