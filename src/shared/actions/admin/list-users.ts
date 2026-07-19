"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";

export interface IUserListItem {
  id: string;
  login: string;
  displayName: string;
  role: string;
  createdAt: Date;
  inCurrentGame: boolean;
}

export async function listUsersAction(): Promise<IUserListItem[]> {
  const prisma = getPrisma();
  const currentGame = await prisma.master.findFirst({ where: { isCurrent: true } });

  const users = await prisma.user.findMany({
    select: { id: true, login: true, displayName: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  let accessUserIds: Set<string> = new Set();
  if (currentGame) {
    const accesses = await prisma.gameAccess.findMany({
      where: { masterId: currentGame.id },
      select: { userId: true },
    });
    accessUserIds = new Set(accesses.map((a) => a.userId));
  }

  return users.map((u) => ({
    ...u,
    createdAt: u.createdAt,
    inCurrentGame: currentGame
      ? u.role === "admin" || accessUserIds.has(u.id) || currentGame.ownerId === u.id
      : false,
  }));
}
