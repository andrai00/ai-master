"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";

export type TSessionRoll = {
  id: string;
  playerId: string | null;
  playerName: string | null;
  checkName: string;
  diceExpression: string;
  count: number;
  status: string;
  resultTotal: number | null;
  resultDetail: string | null;
  assignedBy: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export async function getSessionRollsAction(sessionId: string): Promise<TSessionRoll[]> {
  const prisma = getPrisma();
  const rolls = await prisma.roll.findMany({
    where: { sessionId, status: { not: "cancelled" } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      playerId: true,
      checkName: true,
      diceExpression: true,
      count: true,
      status: true,
      resultTotal: true,
      resultDetail: true,
      assignedBy: true,
      createdAt: true,
      completedAt: true,
    },
  });

  const playerIds = [...new Set(rolls.map(r => r.playerId).filter(Boolean) as string[])];
  const players = playerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameMap = new Map(players.map(p => [p.id, p.displayName]));

  return rolls.map(r => ({ ...r, playerName: r.playerId ? (nameMap.get(r.playerId) ?? null) : null }));
}
