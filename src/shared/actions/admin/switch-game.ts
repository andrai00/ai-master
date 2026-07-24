"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { invalidateActiveGameCache } from "@/src/shared/lib/db/active-game";

export async function switchGameAction(
  masterId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.adminOnlySwitchGame" };

  const prisma = getPrisma();
  const game = await prisma.master.findUnique({ where: { id: masterId } });
  if (!game || game.ownerId !== session.userId) return { success: false, error: "errors.forbidden" };

  await prisma.activeGame.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", currentMasterId: masterId },
    update: { currentMasterId: masterId },
  });

  invalidateActiveGameCache();

  return { success: true };
}
