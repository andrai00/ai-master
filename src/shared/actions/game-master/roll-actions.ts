"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { rollDice, formatRollDetail } from "@/src/shared/lib/dice/roll";
import { isProcessing } from "@/src/shared/lib/agents/gm-runner";

export async function executeRollAction(
  rollId: string
): Promise<{ success: boolean; error?: string; result?: string; detail?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "errors.forbidden" };

  const prisma = getPrisma();
  const roll = await prisma.roll.findUnique({ where: { id: rollId } });
  if (!roll) return { success: false, error: "errors.rollNotFound" };
  if (roll.status !== "assigned") return { success: false, error: "errors.rollAlreadyCompleted" };

  // The master is processing — rolls must wait, in both the game and the
  // personal chat (the processing guard covers every session of the game).
  if (isProcessing(roll.sessionId)) return { success: false, error: "chat.processingBlocked" };

  if (session.role !== "admin") {
    if (!roll.playerId || roll.playerId !== session.userId) {
      return { success: false, error: "errors.forbidden" };
    }
    const s = await prisma.session.findUnique({
      where: { id: roll.sessionId },
      select: { masterId: true },
    });
    if (!s) return { success: false, error: "errors.forbidden" };
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId: s.masterId } },
    });
    if (!access) return { success: false, error: "errors.noGameAccess" };
  }

  const isCompound = roll.diceExpression.startsWith("[[") || roll.diceExpression.startsWith("{");
  const rollCount = isCompound ? 1 : (roll.count ?? 1);

  const totals: number[] = [];
  const outputs: string[] = [];
  for (let i = 0; i < rollCount; i++) {
    const r = rollDice(roll.diceExpression);
    totals.push(...r.totals);
    outputs.push(rollCount > 1 ? `#${i + 1}: ${formatRollDetail(r)}` : formatRollDetail(r));
  }

  const result = totals.join(", ");
  const detail = outputs.join(" | ");

  await prisma.roll.update({
    where: { id: rollId },
    data: { status: "completed", result, detail, completedAt: new Date() },
  });

  broadcastGameEvent("roll_completed", { sessionId: roll.sessionId, rollId });

  return { success: true, result, detail };
}

export async function removeRollAction(
  rollId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

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
