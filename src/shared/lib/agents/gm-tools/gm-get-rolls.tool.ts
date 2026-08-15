import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmGetRollsTool = {
  description: "View session rolls for game chat. Returns assigned (unrolled) and completed (unconsumed) rolls. Use to check results or pending rolls.",
  inputSchema: zodSchema(
    z.object({
      filter: z.enum(["assigned", "completed", "all"]).optional().describe("'assigned', 'completed', 'all' (default)"),
      playerId: z.string().optional().describe("Filter by player. Omit for all."),
    })
  ),
  execute: async (args: { filter?: string; playerId?: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const session = await prisma.session.findFirst({
      where: { masterId: activeGame.currentMasterId, type: "game" },
      select: { id: true },
    });
    if (!session) return [];

    const where: Record<string, unknown> = { sessionId: session.id };
    if (args.playerId) where.playerId = args.playerId;
    if (args.filter === "assigned") where.status = "assigned";
    else if (args.filter === "completed") { where.status = "completed"; where.consumed = false; }
    else where.OR = [{ status: "assigned" }, { status: "completed", consumed: false }];

    const rolls = await prisma.roll.findMany({
      where, orderBy: { createdAt: "asc" }, take: 50,
      select: { id: true, checkName: true, diceExpression: true, status: true, result: true, playerId: true, count: true },
    });

    return rolls.map(r => ({ id: r.id, checkName: r.checkName, expression: r.diceExpression, status: r.status, result: r.result, playerId: r.playerId, count: r.count }));
  },
};

export const gmPersonalGetRollsTool = {
  description: "View personal session rolls. Returns assigned and completed (unconsumed) rolls for this player.",
  inputSchema: zodSchema(
    z.object({
      filter: z.enum(["assigned", "completed", "all"]).optional().describe("'assigned', 'completed', 'all' (default)"),
    })
  ),
  execute: async (args: { filter?: string }) => {
    const prisma = getPrisma();
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const personalSession = await prisma.session.findFirst({
      where: { masterId: activeGame.currentMasterId, type: "personal" },
      select: { id: true },
    });
    if (!personalSession) return [];

    const where: Record<string, unknown> = { sessionId: personalSession.id };
    if (args.filter === "assigned") where.status = "assigned";
    else if (args.filter === "completed") { where.status = "completed"; where.consumed = false; }
    else where.OR = [{ status: "assigned" }, { status: "completed", consumed: false }];

    const rolls = await prisma.roll.findMany({
      where, orderBy: { createdAt: "asc" }, take: 50,
      select: { id: true, checkName: true, diceExpression: true, status: true, result: true, playerId: true, count: true },
    });

    return rolls.map(r => ({ id: r.id, checkName: r.checkName, expression: r.diceExpression, status: r.status, result: r.result, playerId: r.playerId, count: r.count }));
  },
};
