"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

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
};

export async function getPersonalRollsAction(): Promise<TSessionRoll[]> {
  const session = await getSession();
  if (!session) return [];

  const activeGame = await getActiveGame();
  if (!activeGame) return [];

  const prisma = getPrisma();

  if (session.role !== "admin") {
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId: activeGame.currentMasterId } },
    });
    if (!access) return [];
  }

  const personalSession = await prisma.session.findFirst({
    where: { playerId: session.userId, type: "personal", masterId: activeGame.currentMasterId },
    select: { id: true },
  });
  if (!personalSession) return [];

  return prisma.roll.findMany({
    where: { sessionId: personalSession.id, status: { not: "cancelled" } },
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
  }).then(rolls => rolls.map(r => ({ ...r, playerName: null })));
}
