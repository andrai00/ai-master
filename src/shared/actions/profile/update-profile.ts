"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession, createSessionToken, setSessionCookie } from "@/src/shared/lib/auth/session";
import { hashPassword } from "@/src/shared/lib/auth/password";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export async function updateProfileAction(
  displayName: string
): Promise<{ success: boolean; error?: string; displayName?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "errors.unauthorized" };

  const newDisplayName = displayName.trim();
  if (!newDisplayName) return { success: false, error: "errors.nameEmpty" };

  const prisma = getPrisma();
  await prisma.user.update({
    where: { id: session.userId },
    data: { displayName: newDisplayName },
  });

  const newToken = await createSessionToken({
    userId: session.userId,
    role: session.role,
    login: session.login,
    displayName: newDisplayName,
  });
  await setSessionCookie(newToken);

  broadcastGameEvent("profile_updated", { userId: session.userId });

  return { success: true, displayName: newDisplayName };
}

export async function changePasswordAction(
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "errors.unauthorized" };

  const prisma = getPrisma();
  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: hashPassword(newPassword) },
  });

  return { success: true };
}
