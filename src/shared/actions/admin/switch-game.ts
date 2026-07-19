"use server";

import { getSession, createSessionToken, setSessionCookie } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";

export async function switchGameAction(
  masterId: string
): Promise<{ success: boolean; error?: string; masterId?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Не авторизован" };

  const prisma = getPrisma();
  const game = await prisma.master.findUnique({ where: { id: masterId } });
  if (!game) return { success: false, error: "Игра не найдена" };

  const hasAccess =
    game.ownerId === session.userId ||
    (await prisma.gameAccess.count({
      where: { userId: session.userId, masterId },
    })) > 0;

  if (!hasAccess) return { success: false, error: "Нет доступа к этой игре" };

  const token = await createSessionToken({ ...session, masterId });
  await setSessionCookie(token);

  return { success: true, masterId };
}
