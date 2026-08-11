"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { rollDice } from "@/src/shared/lib/dice/roll";

export async function executeRollAction(
  rollId: string
): Promise<{ success: boolean; error?: string; results?: { total: number; detail: string }[] }> {
  const prisma = getPrisma();
  const roll = await prisma.roll.findUnique({ where: { id: rollId } });
  if (!roll) return { success: false, error: "errors.rollNotFound" };
  if (roll.status !== "assigned") return { success: false, error: "errors.rollAlreadyCompleted" };

  const result = rollDice(roll.diceExpression);
  const allResults = [{ total: result.total, detail: result.output }];

  const totalSum = allResults.reduce((s, r) => s + r.total, 0);
  const detailsStr = allResults.length > 1
    ? allResults.map((r, i) => `#${i + 1}: ${r.detail}`).join(" | ")
    : allResults[0].detail;

  await prisma.roll.update({
    where: { id: rollId },
    data: { status: "completed", resultTotal: totalSum, resultDetail: detailsStr, completedAt: new Date() },
  });

  broadcastGameEvent("roll_completed", { sessionId: roll.sessionId, rollId });

  return { success: true, results: allResults };
}

export async function removeRollAction(
  rollId: string
): Promise<{ success: boolean; error?: string }> {
  const prisma = getPrisma();
  const roll = await prisma.roll.findUnique({ where: { id: rollId }, select: { id: true, sessionId: true } });
  if (!roll) return { success: false, error: "errors.rollNotFound" };

  await prisma.roll.update({
    where: { id: rollId },
    data: { status: "cancelled" },
  });

  broadcastGameEvent("roll_removed", { sessionId: roll.sessionId, rollId });

  return { success: true };
}
