"use server";

import { getSession } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";

export async function getCurrentAvatarAction(): Promise<string> {
  const session = await getSession();
  if (!session) return "";

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { avatar: true },
  });

  return user?.avatar || "";
}
