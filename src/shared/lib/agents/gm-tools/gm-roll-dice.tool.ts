import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { rollDice } from "@/src/shared/lib/dice/roll";

export const gmRollDiceTool = {
  description: "Roll dice for yourself (GM only). Saves result to session roll strip.",
  inputSchema: zodSchema(
    z.object({
      expression: z.string().describe("Dice expression in standard RPG notation, e.g. '1d20+5', '4d6kh3', '2d20+1d6'"),
      reason: z.string().describe("What this roll is for (short label)"),
    })
  ),
  execute: async (args: { expression: string; reason: string }) => {
    const result = rollDice(args.expression);
    const activeGame = await getActiveGame();
    const prisma = getPrisma();

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
            result: result.totals.join(", "),
            detail: result.output,
          },
        });
        broadcastGameEvent("roll_completed", { sessionId: session.id });
      }
    }

    return {
      expression: args.expression,
      reason: args.reason,
      total: result.totals.reduce((a, b) => a + b, 0),
      detail: result.output,
      savedToSession: !!sessionId,
    };
  },
};
