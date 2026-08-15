import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { debugLog } from "@/src/shared/lib/debug-log";

export const gmPersonalPresentRollCheckTool = {
  description: "MANDATORY for player dice rolls. Call this tool whenever a player needs to roll dice — this is the ONLY way to give them a roll button. Do NOT write fake button text or dice emojis instead. Use count>1 for multiple identical rolls — all rolled from ONE button.",
  inputSchema: zodSchema(
    z.object({
      checkName: z.string().describe("What this check is: 'Характеристики', 'Проверка навыка', 'Бросок урона'"),
      diceExpression: z.string().describe("Dice expression: '1d20+5', '4d6k3', '2d6+3'"),
      count: z.number().optional().describe("Number of identical rolls from one button (default 1). Use for 6 stat rolls, multiple attacks, etc."),
    })
  ),
  execute: async (args: { checkName: string; diceExpression: string; count?: number }) => {
    console.log("[gm-tool] present_roll_check called:", JSON.stringify(args));
    const currentUser = await getSession();
    if (!currentUser) throw new Error("errors.forbidden");

    const prisma = getPrisma();

    const personalSession = await prisma.session.findFirst({
      where: { playerId: currentUser.userId, type: "personal" },
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
    debugLog("gm-tool:present-roll-check(personal)", "roll created (NO broadcast)", { sessionId: personalSession.id.slice(0, 8), count: rollCount, checkName: args.checkName });
    return {
      assigned: rollCount,
      checkName: args.checkName,
      diceExpression: args.diceExpression,
      count: rollCount,
    };
  },
};
