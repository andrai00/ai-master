"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";

export async function getUserAvatarAction(userId: string): Promise<string> {
  if (!userId) return "";

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  });

  return user?.avatar || "";
}
