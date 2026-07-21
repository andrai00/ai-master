"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export async function deleteBuilderMessageAction(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "Нет прав" };

  const prisma = getPrisma();
  const msg = await prisma.message.findUnique({ where: { id: messageId } });

  if (!msg) return { success: false, error: "Сообщение не найдено" };
  if (msg.summarized) return { success: false, error: "Нельзя удалить — уже в саммари" };

  await prisma.message.delete({ where: { id: messageId } });
  return { success: true };
}
