"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { hashPassword } from "@/src/shared/lib/auth/password";

export async function editUserAction(
  userId: string,
  data: { displayName?: string; password?: string; role?: string }
): Promise<{ success: boolean; error?: string }> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: "Пользователь не найден" };
  if (user.role === "admin" && data.role === "player") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) return { success: false, error: "Нельзя удалить последнего администратора" };
  }

  const update: Record<string, string> = {};
  if (data.displayName !== undefined) update.displayName = data.displayName;
  if (data.password) update.passwordHash = hashPassword(data.password);
  if (data.role && data.role !== user.role) update.role = data.role;

  if (Object.keys(update).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: update as never });
  }

  return { success: true };
}
