"use server";

import { getDb } from "@/src/shared/lib/db/instance";
import { getUserByLogin } from "@/src/shared/lib/db/users";
import { verifyPassword } from "@/src/shared/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/src/shared/lib/auth/session";

export async function loginAction(
  login: string,
  password: string
): Promise<{ success: boolean; error?: string; role?: string }> {
  await getDb();

  if (!login || !password) return { success: false, error: "Введите логин и пароль" };

  const user = await getUserByLogin(login);
  if (!user) return { success: false, error: "Неверный логин или пароль" };

  if (!verifyPassword(password, user.password_hash)) {
    return { success: false, error: "Неверный логин или пароль" };
  }

  const token = await createSessionToken({
    userId: user.id,
    role: user.role,
    login: user.login,
    displayName: user.display_name || user.login,
  });
  await setSessionCookie(token);

  return { success: true, role: user.role };
}
