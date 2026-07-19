"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export async function switchGameAction(
  masterId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "Только админ может переключать игру" };

  const prisma = getPrisma();
  const game = await prisma.master.findUnique({ where: { id: masterId } });
  if (!game || game.ownerId !== session.userId) return { success: false, error: "Нет прав" };

  await prisma.master.updateMany({ where: { ownerId: session.userId }, data: { isCurrent: false } });
  await prisma.master.update({ where: { id: masterId }, data: { isCurrent: true } });

  return { success: true };
}
