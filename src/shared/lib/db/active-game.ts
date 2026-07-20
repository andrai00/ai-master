import "server-only";
import { getPrisma } from "./prisma";

const globalActiveGame = globalThis as unknown as {
  currentMasterId: string | undefined;
  mode: string | undefined;
  promise: Promise<{ currentMasterId: string; mode: string } | null> | undefined;
};

async function initActiveGame(): Promise<{ currentMasterId: string; mode: string } | null> {
  const prisma = getPrisma();

  const existing = await prisma.activeGame.findUnique({ where: { id: "singleton" } });
  if (existing) {
    const master = await prisma.master.findUnique({
      where: { id: existing.currentMasterId },
      select: { mode: true },
    });
    return { currentMasterId: existing.currentMasterId, mode: master?.mode || "development" };
  }

  const firstMaster = await prisma.master.findFirst({ orderBy: { createdAt: "asc" } });
  if (!firstMaster) return null;

  await prisma.activeGame.create({
    data: { id: "singleton", currentMasterId: firstMaster.id },
  });

  return { currentMasterId: firstMaster.id, mode: firstMaster.mode };
}

export async function getActiveGame(): Promise<{ currentMasterId: string; mode: string } | null> {
  if (globalActiveGame.currentMasterId && globalActiveGame.mode) {
    return { currentMasterId: globalActiveGame.currentMasterId, mode: globalActiveGame.mode };
  }

  if (!globalActiveGame.promise) {
    globalActiveGame.promise = initActiveGame();
  }

  const result = await globalActiveGame.promise;
  if (result) {
    globalActiveGame.currentMasterId = result.currentMasterId;
    globalActiveGame.mode = result.mode;
  }
  globalActiveGame.promise = undefined;
  return result;
}

export async function invalidateActiveGameCache(): Promise<void> {
  globalActiveGame.currentMasterId = undefined;
  globalActiveGame.mode = undefined;
  globalActiveGame.promise = undefined;
}
