"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { hashPassword } from "@/src/shared/lib/auth/password";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function createPlayerAction(
  login: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  if (!login || !password) return { success: false, error: "errors.emptyLoginPassword" };
  if (password.length < 4) return { success: false, error: "errors.passwordTooShort" };

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { login } });
  if (existing) return { success: false, error: "errors.duplicateLogin" };

  const id = generateId();
  const hash = hashPassword(password);
  await prisma.user.create({
    data: { id, login, passwordHash: hash, role: "player", displayName: login },
  });

  broadcastGameEvent("user_created", { userId: id, login });
  return { success: true };
}
