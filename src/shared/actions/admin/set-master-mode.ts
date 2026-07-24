"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame, invalidateActiveGameCache } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export async function setMasterModeAction(
  mode: "development" | "game"
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { success: false, error: "errors.adminOnlyChangeMode" };
  }

  const activeGame = await getActiveGame();
  if (!activeGame) {
    return { success: false, error: "errors.noActiveGame" };
  }

  const prisma = getPrisma();
  await prisma.master.update({
    where: { id: activeGame.currentMasterId },
    data: { mode },
  });

  invalidateActiveGameCache();

  // SSE-push: notify all connected clients that the mode changed
  broadcastGameEvent("mode_switch", {
    masterId: activeGame.currentMasterId,
    mode,
  });

  return { success: true };
}

export async function getActiveModeAction(): Promise<{ mode: string } | null> {
  const activeGame = await getActiveGame();
  if (!activeGame) return null;
  return { mode: activeGame.mode };
}
