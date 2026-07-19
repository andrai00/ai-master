"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
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
  if (!login || !password) return { success: false, error: "Логин и пароль обязательны" };
  if (password.length < 4) return { success: false, error: "Пароль должен быть не менее 4 символов" };

  const prisma = getPrisma();
  const existingAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (existingAdmin) return { success: false, error: "Администратор уже существует" };

  const id = generateId();
  const hash = hashPassword(password);
  await prisma.user.create({
    data: { id, login, passwordHash: hash, role: "admin", displayName: login },
  });

  const token = await createSessionToken({ userId: id, role: "admin", login, displayName: login });
  await setSessionCookie(token);

  return { success: true };
}
