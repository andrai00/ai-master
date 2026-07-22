"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export interface IThoughtLogItem {
  id: string;
  agent: string;
  content: string;
  createdAt: Date;
}

export async function listThoughtLogsAction(): Promise<IThoughtLogItem[]> {
  const session = await getSession();
  if (!session || session.role !== "admin") return [];

  const activeGame = await getActiveGame();
  if (!activeGame) return [];

  const prisma = getPrisma();
  return prisma.thoughtLog.findMany({
    where: { masterId: activeGame.currentMasterId },
    orderBy: { createdAt: "desc" },
    select: { id: true, agent: true, content: true, createdAt: true },
    take: 200,
  });
}
