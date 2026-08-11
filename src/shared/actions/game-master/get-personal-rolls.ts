"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export type TSessionRoll = {
  id: string;
  playerId: string | null;
  checkName: string;
  diceExpression: string;
  count: number;
  status: string;
  resultTotal: number | null;
  resultDetail: string | null;
  assignedBy: string | null;
  createdAt: Date;
};

export async function getPersonalRollsAction(): Promise<TSessionRoll[]> {
  const session = await getSession();
  if (!session) return [];

  const prisma = getPrisma();

  const personalSession = await prisma.session.findFirst({
    where: { playerId: session.userId, type: "personal" },
    select: { id: true },
  });
  if (!personalSession) return [];

  return prisma.roll.findMany({
    where: { sessionId: personalSession.id, status: "completed" },
    orderBy: { createdAt: "asc" },
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
    },
  });
}
