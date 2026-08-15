"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent, broadcastToUser } from "@/src/shared/lib/events/game-events";

export async function deleteUserAction(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: "errors.userNotFound" };
  if (user.role === "admin") return { success: false, error: "errors.cannotDeleteAdmin" };

  await prisma.user.delete({ where: { id: userId } });
  broadcastToUser(userId, "kick", { reason: "deleted" });
  broadcastGameEvent("user_deleted", { userId });
  return { success: true };
}
