"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession, createSessionToken, setSessionCookie } from "@/src/shared/lib/auth/session";
import { hashPassword } from "@/src/shared/lib/auth/password";

export async function updateProfileAction(
  displayName: string,
  avatar: string
): Promise<{ success: boolean; error?: string; displayName?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Не авторизован" };

  const newDisplayName = displayName.trim();
  if (!newDisplayName) return { success: false, error: "Имя не может быть пустым" };

  const prisma = getPrisma();
  await prisma.user.update({
    where: { id: session.userId },
    data: { displayName: newDisplayName, avatar },
  });

  const newToken = await createSessionToken({
    userId: session.userId,
    role: session.role,
    login: session.login,
    displayName: newDisplayName,
  });
  await setSessionCookie(newToken);

  return { success: true, displayName: newDisplayName };
}

export async function changePasswordAction(
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Не авторизован" };

  if (newPassword.length < 4) return { success: false, error: "Пароль должен быть не менее 4 символов" };

  const prisma = getPrisma();
  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: hashPassword(newPassword) },
  });

  return { success: true };
}
