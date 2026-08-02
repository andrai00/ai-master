import "server-only";
import { getPrisma } from "./prisma";

const globalActiveGame = globalThis as unknown as {
  promise: Promise<{ currentMasterId: string; mode: string } | null> | undefined;
};

async function initActiveGame(): Promise<{ currentMasterId: string; mode: string } | null> {
  const prisma = getPrisma();

  const existing = await prisma.activeGame.findUnique({ where: { id: "singleton" } });
  if (!existing) return null;

  const master = await prisma.master.findUnique({
    where: { id: existing.currentMasterId },
    select: { mode: true },
  });
  return { currentMasterId: existing.currentMasterId, mode: master?.mode || "development" };
}

export async function getActiveGame(): Promise<{ currentMasterId: string; mode: string } | null> {
  if (!globalActiveGame.promise) {
    globalActiveGame.promise = initActiveGame();
  }

  const result = await globalActiveGame.promise;
  globalActiveGame.promise = undefined;
  return result;
}

export async function invalidateActiveGameCache(): Promise<void> {
  globalActiveGame.promise = undefined;
}
