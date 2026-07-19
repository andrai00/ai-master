"use server";

import { getDb } from "@/src/shared/lib/db/instance";
import { updateUserProfile, updateUserPassword } from "@/src/shared/lib/db/users";
import { getSession, createSessionToken, setSessionCookie } from "@/src/shared/lib/auth/session";
import { hashPassword, verifyPassword } from "@/src/shared/lib/auth/password";

export async function updateProfileAction(
  displayName: string,
  avatar: string
): Promise<{ success: boolean; error?: string; displayName?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Не авторизован" };

  if (!displayName.trim()) return { success: false, error: "Имя не может быть пустым" };

  const newDisplayName = displayName.trim();

  await getDb();
  await updateUserProfile(session.userId, newDisplayName, avatar);

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
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Не авторизован" };

  if (newPassword.length < 4) return { success: false, error: "Пароль должен быть не менее 4 символов" };

  const db = await getDb();
  const stmt = db.prepare("SELECT password_hash FROM users WHERE id = ?");
  stmt.bind([session.userId]);
  if (!stmt.step()) {
    stmt.free();
    return { success: false, error: "Пользователь не найден" };
  }
  const row = stmt.getAsObject() as { password_hash: string };
  stmt.free();

  if (!verifyPassword(currentPassword, row.password_hash)) {
    return { success: false, error: "Неверный текущий пароль" };
  }

  await updateUserPassword(session.userId, hashPassword(newPassword));
  return { success: true };
}
