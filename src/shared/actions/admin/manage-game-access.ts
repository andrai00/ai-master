"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastToUser } from "@/src/shared/lib/events/game-events";

export async function setUserGameAccessAction(
  userId: string,
  masterIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  const prisma = getPrisma();

  const prevAccess = await prisma.gameAccess.findMany({
    where: { userId },
    select: { masterId: true },
  });
  const prevIds = new Set(prevAccess.map((a) => a.masterId));
  const newIds = new Set(masterIds);

  await prisma.gameAccess.deleteMany({ where: { userId } });

  if (masterIds.length > 0) {
    await prisma.gameAccess.createMany({
      data: masterIds.map((masterId) => ({ userId, masterId })),
    });
  }

  const removedIds = [...prevIds].filter((id) => !newIds.has(id));
  if (removedIds.length > 0) {
    const activeGame = await prisma.activeGame.findUnique({
      where: { id: "singleton" },
      select: { currentMasterId: true },
    });
    if (activeGame && removedIds.includes(activeGame.currentMasterId)) {
      broadcastToUser(userId, "kick", { reason: "access_removed" });
    }
  }

  return { success: true };
}

export async function getUserGameAccessAction(
  userId: string
): Promise<string[]> {
  const session = await getSession();
  if (!session || session.role !== "admin") return [];

  const prisma = getPrisma();
  const accesses = await prisma.gameAccess.findMany({
    where: { userId },
    select: { masterId: true },
  });
  return accesses.map((a) => a.masterId);
}
