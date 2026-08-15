import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export const gmPresentRollCheckTool = {
  description: "Assign dice rolls to specific players. Each player sees ONE roll button per check. Use count>1 for multiple identical rolls (e.g. 6 stat rolls) — all are rolled from that single button.",
  inputSchema: zodSchema(
    z.object({
      checkName: z.string().describe("What this check is: 'Инициатива', 'Скрытность', 'Спасбросок Ловкости', 'Характеристики'"),
      diceExpression: z.string().describe("Dice expression: '1d20+5', '2d6+3', '4d6k3'"),
      targetPlayers: z.array(z.string()).describe("Array of player IDs (senderId/userId) who need to roll"),
      count: z.number().optional().describe("Number of identical rolls per player from one button (default 1). Use for stat rolls, multiple attacks, etc."),
    })
  ),
  execute: async (args: { checkName: string; diceExpression: string; targetPlayers: string[]; count?: number }) => {
    console.log("[gm-tool] game present_roll_check called:", JSON.stringify(args));
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
    const rollCount = args.count ?? 1;
    const created: string[] = [];

    for (const playerId of args.targetPlayers) {
      const roll = await prisma.roll.create({
        data: {
          sessionId: session.id,
          playerId,
          checkName: args.checkName,
          diceExpression: args.diceExpression,
          count: rollCount,
          status: "assigned",
          assignedBy,
        },
      });
      created.push(roll.id);
    }

    broadcastGameEvent("roll_assigned", { sessionId: session.id });

    return {
      assigned: created.length * rollCount,
      checkName: args.checkName,
      diceExpression: args.diceExpression,
      playerIds: args.targetPlayers,
      count: rollCount,
    };
  },
};
