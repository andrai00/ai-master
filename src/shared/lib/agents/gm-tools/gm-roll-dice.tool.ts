import { z } from "zod";
import { zodSchema } from "ai";

export const gmRollDiceTool = {
  description: "Roll dice using standard notation (e.g. '2d6+3', '1d20+5', '4d6k3'). Returns the roll breakdown and total.",
  inputSchema: zodSchema(
    z.object({
      expression: z.string().describe("Dice expression in standard notation. Examples: '1d20', '2d6+3', '4d6k3' (keep highest 3), '1d20+5'"),
      reason: z.string().optional().describe("Why this roll is being made (for logging/context)"),
    })
  ),
  execute: async (args: { expression: string; reason?: string }) => {
    const parsed = parseDiceExpression(args.expression);
    const { results, total } = rollDice(parsed);
    return {
      expression: args.expression,
      reason: args.reason ?? null,
      rolls: results,
      total,
      detail: `${args.expression} → [${results.join(", ")}]${parsed.modifier !== 0 ? ` ${parsed.modifier > 0 ? "+" : ""}${parsed.modifier}` : ""} = ${total}`,
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
  let keepHighest: number | undefined;

  const kMatch = clean.match(/^(\d+)d(\d+)k(\d+)$/);
  if (kMatch) {
    keepHighest = parseInt(kMatch[3], 10);
    return {
      count: parseInt(kMatch[1], 10),
      sides: parseInt(kMatch[2], 10),
      modifier: 0,
      keepHighest,
    };
  }

  const match = clean.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) {
    return { count: 1, sides: 6, modifier: parseInt(clean, 10) || 0 };
  }

  return {
    count: parseInt(match[1], 10),
    sides: parseInt(match[2], 10),
    modifier: match[3] ? parseInt(match[3], 10) : 0,
    keepHighest,
  };
}

function rollDice(parsed: IParsedDice): { results: number[]; total: number } {
  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(Math.floor(Math.random() * parsed.sides) + 1);
  }

  const kept = parsed.keepHighest
    ? rolls.sort((a, b) => b - a).slice(0, parsed.keepHighest)
    : rolls;

  const sum = kept.reduce((a, b) => a + b, 0);
  return { results: rolls, total: sum + parsed.modifier };
}
