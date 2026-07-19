"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";

export interface IUserListItem {
  id: string;
  login: string;
  displayName: string;
  role: string;
  createdAt: Date;
}

export async function listUsersAction(): Promise<IUserListItem[]> {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    select: { id: true, login: true, displayName: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => ({ ...u, createdAt: u.createdAt }));
}
