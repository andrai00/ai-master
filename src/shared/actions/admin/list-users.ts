"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";

export interface IUserGameAccess {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface IUserListItem {
  id: string;
  login: string;
  displayName: string;
  role: string;
  inCurrentGame: boolean;
  games: IUserGameAccess[];
}

export async function listUsersAction(): Promise<IUserListItem[]> {
  const prisma = getPrisma();

  const [users, allGames, accesses, currentGame] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, login: true, displayName: true, role: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.master.findMany({ select: { id: true, name: true, isCurrent: true } }),
    prisma.gameAccess.findMany({ select: { userId: true, masterId: true } }),
    prisma.master.findFirst({ where: { isCurrent: true }, select: { id: true } }),
  ]);

  const accessMap = new Map<string, Set<string>>();
  for (const a of accesses) {
    if (!accessMap.has(a.userId)) accessMap.set(a.userId, new Set());
    accessMap.get(a.userId)!.add(a.masterId);
  }

  return users.map((u) => {
    const userGameIds = accessMap.get(u.id) || new Set();
    const userGames = allGames
      .filter((g) => {
        if (u.role === "admin") return true;
        if (g.id === currentGame?.id) return userGameIds.has(g.id);
        return userGameIds.has(g.id);
      })
      .map((g) => ({ id: g.id, name: g.name, isCurrent: g.isCurrent }));
    return {
      id: u.id,
      login: u.login,
      displayName: u.displayName,
      role: u.role,
      inCurrentGame: currentGame ? u.role === "admin" || userGameIds.has(currentGame.id) : false,
      games: userGames,
    };
  });
}
