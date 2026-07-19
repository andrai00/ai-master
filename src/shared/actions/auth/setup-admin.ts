"use server";

import { getDb } from "@/src/shared/lib/db/instance";
import { createUser, hasAnyAdmin } from "@/src/shared/lib/db/users";
import { hashPassword } from "@/src/shared/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/src/shared/lib/auth/session";

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function setupFirstAdmin(
  login: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  await getDb();

  if (!login || !password) return { success: false, error: "Логин и пароль обязательны" };
  if (password.length < 4) return { success: false, error: "Пароль должен быть не менее 4 символов" };

  if (await hasAnyAdmin()) return { success: false, error: "Администратор уже существует" };

  const id = generateId();
  const hash = hashPassword(password);
  await createUser(id, login, hash, "admin");

  const token = await createSessionToken({ userId: id, role: "admin", login, displayName: login });
  await setSessionCookie(token);

  return { success: true };
}
