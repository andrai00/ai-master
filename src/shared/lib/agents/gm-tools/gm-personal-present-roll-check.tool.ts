import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmPersonalPresentRollCheckTool = {
  description: "MANDATORY for player dice rolls. Call this tool whenever a player needs to roll dice — this is the ONLY way to give them a roll button. Do NOT write fake button text or dice emojis instead. Use count>1 for multiple identical rolls — all rolled from ONE button.",
  inputSchema: zodSchema(
    z.object({
      checkName: z.string().describe("Short label for the check (it becomes the button text)"),
      diceExpression: z.string().describe("Dice expression in standard RPG notation, e.g. '1d20+5', '2d6', '4d6kh3'"),
      count: z.number().optional().describe("Number of identical rolls from one button (default 1). Use for several identical rolls (e.g. multiple values from a table)."),
    })
  ),
  execute: async (args: { checkName: string; diceExpression: string; count?: number }) => {
    console.log("[gm-tool] present_roll_check called:", JSON.stringify(args));
    const currentUser = await getSession();
    if (!currentUser) throw new Error("errors.forbidden");

    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();

    const personalSession = await prisma.session.findFirst({
      where: { playerId: currentUser.userId, type: "personal", masterId: activeGame.currentMasterId },
      select: { id: true },
    });
    if (!personalSession) throw new Error("errors.sessionNotFound");

    const rollCount = args.count ?? 1;

    await prisma.roll.create({
      data: {
        sessionId: personalSession.id,
        playerId: currentUser.userId,
        checkName: args.checkName,
        diceExpression: args.diceExpression,
        count: rollCount,
        status: "assigned",
        assignedBy: currentUser.userId,
      },
    });

    console.log(`[gm-tool] present_roll_check done: one button for ${rollCount} rolls`);
    return {
      assigned: rollCount,
      checkName: args.checkName,
      diceExpression: args.diceExpression,
      count: rollCount,
    };
  },
};
