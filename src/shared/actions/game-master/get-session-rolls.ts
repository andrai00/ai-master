"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";

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

export async function getSessionRollsAction(sessionId: string): Promise<TSessionRoll[]> {
  const prisma = getPrisma();
  return prisma.roll.findMany({
    where: { sessionId, status: { not: "cancelled" }, consumed: false },
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
