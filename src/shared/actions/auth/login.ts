"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { verifyPassword } from "@/src/shared/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export async function loginAction(
  login: string,
  password: string
): Promise<{ success: boolean; error?: string; role?: string }> {
  if (!login || !password) return { success: false, error: "Введите логин и пароль" };

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { login } });
  if (!user) return { success: false, error: "Неверный логин или пароль" };

  if (!verifyPassword(password, user.passwordHash)) {
    return { success: false, error: "Неверный логин или пароль" };
  }

  if (user.role === "player") {
    const activeGame = await getActiveGame();
    if (!activeGame) return { success: false, error: "Администратор ещё не настроил игру" };
    const hasAccess =
      (await prisma.gameAccess.count({ where: { userId: user.id, masterId: activeGame.currentMasterId } })) > 0;
    if (!hasAccess) return { success: false, error: "У вас нет доступа к текущей игре" };
  }

  const token = await createSessionToken({
    userId: user.id,
    role: user.role as "admin" | "player",
    login: user.login,
    displayName: user.displayName || user.login,
  });
  await setSessionCookie(token);

  return { success: true, role: user.role as "admin" | "player" };
}
