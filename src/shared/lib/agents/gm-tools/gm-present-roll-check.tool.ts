import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export const gmPresentRollCheckTool = {
  description: "Assign dice rolls to specific players. Pass several playerIds in targetPlayers to give the same check to several players at once — each player gets their OWN button and result (e.g. initiative before combat, one call for the whole party). Use count>1 for multiple identical rolls for ONE player (e.g. 6 stat rolls) — all are rolled from that single button.",
  inputSchema: zodSchema(
    z.object({
      checkName: z.string().describe("Short label for the check (it becomes the button text)"),
      diceExpression: z.string().describe("Dice expression in standard RPG notation, e.g. '1d20+5', '2d6', '4d6kh3'"),
      targetPlayers: z.array(z.string()).describe("Array of player IDs (senderId/userId) who need to roll"),
      count: z.number().optional().describe("Number of identical rolls from one button (default 1). Use for several identical rolls (e.g. multiple values from a table)."),
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

    const accesses = await prisma.gameAccess.findMany({
      where: { masterId: activeGame.currentMasterId, userId: { in: args.targetPlayers } },
      select: { userId: true },
    });
    const accessIds = new Set(accesses.map((a) => a.userId));
    const users = await prisma.user.findMany({
      where: { id: { in: args.targetPlayers } },
      select: { id: true, role: true },
    });
    // A participant is allowed if they have a GameAccess row OR are an admin
    // (admins have access to every game by role, no GameAccess row exists).
    const allowedPlayers = new Set(
      users.filter((u) => u.role === "admin" || accessIds.has(u.id)).map((u) => u.id)
    );

    for (const playerId of args.targetPlayers) {
      if (!allowedPlayers.has(playerId)) continue;

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
