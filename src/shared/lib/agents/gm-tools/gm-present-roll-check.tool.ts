import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export const gmPresentRollCheckTool = {
  description: "Assign a dice roll to specific players. Each player will see a roll button. When the player clicks it, the dice are rolled and the result appears in the roll strip. Use for skill checks, initiative, saving throws, etc.",
  inputSchema: zodSchema(
    z.object({
      checkName: z.string().describe("What this check is: 'Инициатива', 'Скрытность', 'Спасбросок Ловкости'"),
      diceExpression: z.string().describe("Dice expression: '1d20+5', '2d6+3', '4d6k3'"),
      targetPlayers: z.array(z.string()).describe("Array of player IDs (senderId/userId) who need to roll"),
    })
  ),
  execute: async (args: { checkName: string; diceExpression: string; targetPlayers: string[] }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") {
      throw new Error("errors.notInGameMode");
    }

    const prisma = getPrisma();

    const session = await prisma.session.findFirst({
      where: { masterId: activeGame.currentMasterId, type: "game" },
      select: { id: true },
    });
    if (!session) throw new Error("errors.sessionNotFound");

    const currentUser = await getSession();
    const assignedBy = currentUser?.userId;

    const created: string[] = [];

    for (const playerId of args.targetPlayers) {
      const roll = await prisma.roll.create({
        data: {
          sessionId: session.id,
          playerId,
          checkName: args.checkName,
          diceExpression: args.diceExpression,
          status: "assigned",
          assignedBy,
        },
      });
      created.push(roll.id);
    }

    broadcastGameEvent("roll_assigned", { sessionId: session.id });

    return {
      assigned: created.length,
      checkName: args.checkName,
      diceExpression: args.diceExpression,
      playerIds: args.targetPlayers,
    };
  },
};
