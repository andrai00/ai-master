import { z } from "zod";
import { zodSchema } from "ai";
import { rollDice, DICE_NOTATION_REFERENCE } from "@/src/shared/lib/dice/roll";

export const gmPersonalRollDiceTool = {
  description: `Roll dice for personal chat (character creation, private checks). Result is private — NOT saved to the game session.${DICE_NOTATION_REFERENCE}`,
  inputSchema: zodSchema(
    z.object({
      expression: z.string().describe("Dice expression in standard RPG notation: '1d20+5', '4d6kh3', '4d6dl1', '2d20+1d6'"),
      reason: z.string().describe("What this roll is for: 'Определение характеристик', 'Проверка удачи'"),
    })
  ),
  execute: async (args: { expression: string; reason: string }) => {
    const result = rollDice(args.expression);
    return {
      expression: args.expression,
      reason: args.reason,
      total: result.total,
      detail: result.output,
    };
  },
};
