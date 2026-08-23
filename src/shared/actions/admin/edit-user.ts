"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { hashPassword } from "@/src/shared/lib/auth/password";
import { broadcastGameEvent, broadcastToUser } from "@/src/shared/lib/events/game-events";

export async function editUserAction(
  userId: string,
  data: { login?: string; displayName?: string; password?: string; role?: string }
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: "errors.userNotFound" };
  if (user.role === "admin" && data.role === "player") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) return { success: false, error: "errors.cannotDemoteLastAdmin" };
  }

  const update: Record<string, string> = {};
  if (data.login !== undefined) {
    const newLogin = data.login.trim();
    if (!newLogin) return { success: false, error: "errors.emptyLoginPassword" };
    if (newLogin !== user.login) {
      const clash = await prisma.user.findUnique({ where: { login: newLogin } });
      if (clash) return { success: false, error: "errors.duplicateLogin" };
      update.login = newLogin;
    }
  }
  if (data.displayName !== undefined) update.displayName = data.displayName;
  if (data.password !== undefined) update.passwordHash = hashPassword(data.password);
  if (data.role && data.role !== user.role) update.role = data.role;

  if (Object.keys(update).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: update as never });
  }

  if (data.role && data.role !== user.role) {
    broadcastToUser(userId, "kick", { reason: "role_changed" });
  }
  broadcastGameEvent("user_updated", { userId });

  return { success: true };
}
