"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";

export async function deleteUserAction(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: "Пользователь не найден" };
  if (user.role === "admin") return { success: false, error: "Нельзя удалить администратора" };

  await prisma.user.delete({ where: { id: userId } });
  return { success: true };
}
