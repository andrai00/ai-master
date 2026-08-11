import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export const gmPersonalPresentRollCheckTool = {
  description: "MANDATORY for player dice rolls. Call this tool whenever a player needs to roll dice — this is the ONLY way to give them roll buttons. Do NOT write fake button text or dice emojis instead. Use count>1 for multiple rolls.",
  inputSchema: zodSchema(
    z.object({
      checkName: z.string().describe("What this check is: 'Характеристики', 'Проверка навыка', 'Бросок урона'"),
      diceExpression: z.string().describe("Dice expression: '1d20+5', '4d6k3', '2d6+3'"),
      count: z.number().optional().describe("Number of identical rolls (default 1). Creates separate labeled buttons: #1, #2, etc."),
    })
  ),
  execute: async (args: { checkName: string; diceExpression: string; count?: number }) => {
    if (args.diceExpression.includes("{")) {
      throw new Error("Invalid dice expression: {N,N,N} is a GROUP sum. Use count parameter for separate rolls instead.");
    }
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

    for (let i = 0; i < rollCount; i++) {
      const rollName = rollCount > 1 ? `${args.checkName} #${i + 1}` : args.checkName;
      await prisma.roll.create({
        data: {
          sessionId: personalSession.id,
          playerId: currentUser.userId,
          checkName: rollName,
          diceExpression: args.diceExpression,
          status: "assigned",
          assignedBy: currentUser.userId,
        },
      });
    }

    console.log(`[gm-tool] present_roll_check done: ${rollCount} rolls created`);
    return {
      assigned: rollCount,
      checkName: args.checkName,
      diceExpression: args.diceExpression,
      count: rollCount,
    };
  },
};
