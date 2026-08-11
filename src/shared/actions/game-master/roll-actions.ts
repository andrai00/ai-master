"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export async function executeRollAction(
  rollId: string
): Promise<{ success: boolean; error?: string; results?: { total: number; detail: string }[] }> {
  const prisma = getPrisma();
  const roll = await prisma.roll.findUnique({ where: { id: rollId } });
  if (!roll) return { success: false, error: "errors.rollNotFound" };
  if (roll.status !== "assigned") return { success: false, error: "errors.rollAlreadyCompleted" };

  const rollCount = roll.count ?? 1;
  const allResults: { total: number; detail: string }[] = [];

  for (let i = 0; i < rollCount; i++) {
    const parsed = parseDiceExpression(roll.diceExpression);
    const { results, total } = rollDice(parsed);
    const detail = formatDetail(results, parsed);
    allResults.push({ total, detail });
  }

  const totalSum = allResults.reduce((s, r) => s + r.total, 0);
  const detailsStr = rollCount > 1
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

interface IParsedDice {
  count: number;
  sides: number;
  modifier: number;
  keepHighest?: number;
}

function parseDiceExpression(expr: string): IParsedDice {
  const clean = expr.replace(/\s+/g, "").toLowerCase();
  const kMatch = clean.match(/^(\d+)d(\d+)k(\d+)$/);
  if (kMatch) {
    return { count: parseInt(kMatch[1], 10), sides: parseInt(kMatch[2], 10), modifier: 0, keepHighest: parseInt(kMatch[3], 10) };
  }
  const match = clean.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return { count: 1, sides: 6, modifier: parseInt(clean, 10) || 0 };
  return { count: parseInt(match[1], 10), sides: parseInt(match[2], 10), modifier: match[3] ? parseInt(match[3], 10) : 0 };
}

function rollDice(parsed: IParsedDice): { results: number[]; total: number } {
  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) rolls.push(Math.floor(Math.random() * parsed.sides) + 1);
  const kept = parsed.keepHighest ? rolls.sort((a, b) => b - a).slice(0, parsed.keepHighest) : rolls;
  return { results: rolls, total: kept.reduce((a, b) => a + b, 0) + parsed.modifier };
}

function formatDetail(results: number[], parsed: IParsedDice): string {
  const rollStr = `[${results.join(", ")}]`;
  const modStr = parsed.modifier !== 0 ? ` ${parsed.modifier > 0 ? "+" : ""}${parsed.modifier}` : "";
  const keepStr = parsed.keepHighest ? ` (keep ${parsed.keepHighest})` : "";
  return `${parsed.count}d${parsed.sides}${modStr}${keepStr} → ${rollStr}${modStr}`;
}
