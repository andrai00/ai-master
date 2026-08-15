"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export async function getUserAvatarAction(userId: string): Promise<string> {
  if (!userId) return "";
  const session = await getSession();
  if (!session) return "";

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  });

  return user?.avatar || "";
}
