import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export const gmPersonalPresentRollCheckTool = {
  description: "Assign dice rolls to the current player in personal chat. Player sees one roll button. ALWAYS use this when a player needs to roll — never roll for them. Use count>1 for multiple identical rolls.",
  inputSchema: zodSchema(
    z.object({
      checkName: z.string().describe("What this check is: 'Характеристики', 'Проверка навыка', 'Бросок урона'"),
      diceExpression: z.string().describe("Dice expression: '1d20+5', '4d6k3', '2d6+3'"),
      count: z.number().optional().describe("Number of identical rolls (default 1). Use for 6 stat rolls, etc."),
    })
  ),
  execute: async (args: { checkName: string; diceExpression: string; count?: number }) => {
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

    return {
      assigned: rollCount,
      checkName: args.checkName,
      diceExpression: args.diceExpression,
      count: rollCount,
    };
  },
};
