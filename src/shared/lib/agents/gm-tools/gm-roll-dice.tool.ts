import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export const gmRollDiceTool = {
  description: "Roll dice using standard notation (e.g. '2d6+3', '1d20+5', '4d6k3'). Saves the roll result to the session's roll history (visible to all players in the roll strip).",
  inputSchema: zodSchema(
    z.object({
      expression: z.string().describe("Dice expression. Examples: '1d20', '2d6+3', '4d6k3'"),
      reason: z.string().describe("What this roll is for: 'Инициатива', 'Атака мечом', 'Скрытность'"),
    })
  ),
  execute: async (args: { expression: string; reason: string }) => {
    const activeGame = await getActiveGame();
    const prisma = getPrisma();

    const parsed = parseDiceExpression(args.expression);
    const { results, total } = rollDice(parsed);
    const modStr = parsed.modifier !== 0 ? ` ${parsed.modifier > 0 ? "+" : ""}${parsed.modifier}` : "";
    const detail = `[${results.join(", ")}]${modStr} = ${total}`;

    let sessionId: string | null = null;

    if (activeGame?.mode === "game") {
      const session = await prisma.session.findFirst({
        where: { masterId: activeGame.currentMasterId, type: "game" },
        select: { id: true },
      });
      if (session) {
        sessionId = session.id;
        await prisma.roll.create({
          data: {
            sessionId: session.id,
            checkName: args.reason,
            diceExpression: args.expression,
            status: "completed",
            resultTotal: total,
            resultDetail: detail,
          },
        });
        broadcastGameEvent("roll_completed", { sessionId: session.id });
      }
    }

    return {
      expression: args.expression,
      reason: args.reason,
      rolls: results,
      total,
      detail: `${args.expression} → ${detail}`,
      savedToSession: !!sessionId,
    };
  },
};

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
