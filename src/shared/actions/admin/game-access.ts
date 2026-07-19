"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";

export async function setUserGameAccessAction(
  userId: string,
  masterIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const prisma = getPrisma();

  await prisma.gameAccess.deleteMany({ where: { userId } });

  if (masterIds.length > 0) {
    await prisma.gameAccess.createMany({
      data: masterIds.map((masterId) => ({ userId, masterId })),
    });
  }

  return { success: true };
}

export async function getUserGameAccessAction(
  userId: string
): Promise<string[]> {
  const prisma = getPrisma();
  const accesses = await prisma.gameAccess.findMany({
    where: { userId },
    select: { masterId: true },
  });
  return accesses.map((a) => a.masterId);
}
