import { z } from "zod";
import { zodSchema } from "ai";

export const gmPersonalRollDiceTool = {
  description: "Roll dice for personal chat (character creation, private checks). Result is private — NOT saved to the game session roll strip.",
  inputSchema: zodSchema(
    z.object({
      expression: z.string().describe("Dice expression: '1d20+5', '4d6k3', '2d6+3'"),
      reason: z.string().describe("What this roll is for: 'Определение характеристик', 'Проверка удачи'"),
    })
  ),
  execute: async (args: { expression: string; reason: string }) => {
    const parsed = parseDiceExpression(args.expression);
    const { results, total } = rollDice(parsed);
    const modStr = parsed.modifier !== 0 ? ` ${parsed.modifier > 0 ? "+" : ""}${parsed.modifier}` : "";
    const detail = `[${results.join(", ")}]${modStr} = ${total}`;

    return {
      expression: args.expression,
      reason: args.reason,
      rolls: results,
      total,
      detail: `${args.expression} → ${detail}`,
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
