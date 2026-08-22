"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export type TSessionRoll = {
  id: string;
  playerId: string | null;
  playerName: string | null;
  checkName: string;
  diceExpression: string;
  count: number;
  status: string;
  result: string | null;
  detail: string | null;
  assignedBy: string | null;
  createdAt: Date;
  completedAt: Date | null;
  /** True when SHOW_MASTER_ROLL_NAMES=1 — master rolls reveal their check name in the game chat. */
  revealMasterRollNames: boolean;
};

export async function getSessionRollsAction(sessionId: string): Promise<TSessionRoll[]> {
  const session = await getSession();
  if (!session) return [];

  const prisma = getPrisma();

  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { masterId: true },
  });
  if (!s) return [];

  if (session.role !== "admin") {
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId: s.masterId } },
    });
    if (!access) return [];
  }

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
      result: true,
      detail: true,
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

  const revealMasterRollNames = process.env.SHOW_MASTER_ROLL_NAMES === "1";

  return rolls.map(r => ({
    ...r,
    playerName: r.playerId ? (nameMap.get(r.playerId) ?? null) : null,
    revealMasterRollNames,
  }));
}
