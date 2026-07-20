"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

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
  const activeGame = await getActiveGame();

  const [users, allGames, accesses] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, login: true, displayName: true, role: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.master.findMany({ select: { id: true, name: true } }),
    prisma.gameAccess.findMany({ select: { userId: true, masterId: true } }),
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
        if (!activeGame) return false;
        if (g.id === activeGame.currentMasterId) return userGameIds.has(g.id);
        return userGameIds.has(g.id);
      })
      .map((g) => ({ id: g.id, name: g.name, isCurrent: activeGame ? g.id === activeGame.currentMasterId : false }));
    return {
      id: u.id,
      login: u.login,
      displayName: u.displayName,
      role: u.role,
      inCurrentGame: activeGame ? (u.role === "admin" || userGameIds.has(activeGame.currentMasterId)) : false,
      games: userGames,
    };
  });
}
