"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { debugLog } from "@/src/shared/lib/debug-log";
import { rollDice } from "@/src/shared/lib/dice/roll";

export async function executeRollAction(
  rollId: string
): Promise<{ success: boolean; error?: string; result?: string }> {
  const prisma = getPrisma();
  const roll = await prisma.roll.findUnique({ where: { id: rollId } });
  if (!roll) return { success: false, error: "errors.rollNotFound" };
  if (roll.status !== "assigned") return { success: false, error: "errors.rollAlreadyCompleted" };

  const isCompound = roll.diceExpression.startsWith("[[") || roll.diceExpression.startsWith("{");
  const rollCount = isCompound ? 1 : (roll.count ?? 1);

  let result: string;
  if (rollCount > 1) {
    const outputs: string[] = [];
    for (let i = 0; i < rollCount; i++) {
      outputs.push(`#${i + 1}: ${rollDice(roll.diceExpression).output}`);
    }
    result = outputs.join(" | ");
  } else {
    result = rollDice(roll.diceExpression).output;
  }

  await prisma.roll.update({
    where: { id: rollId },
    data: { status: "completed", result, completedAt: new Date() },
  });

  debugLog("roll-actions", "executeRoll completed", { sessionId: roll.sessionId.slice(0, 8), rollId, result });
  broadcastGameEvent("roll_completed", { sessionId: roll.sessionId, rollId });

  return { success: true, result };
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
