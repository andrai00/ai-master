import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const builderGetPlayerSheetTool = {
  description:
    "Get player character data (game_visible documents linked to them). Without playerId returns ALL character sheets and player records — pass a playerId to get one player's data. Use in MEMORY mode to see player data before migrating or updating sheets.",
  inputSchema: zodSchema(
    z.object({
      playerId: z.string().optional().describe("Player ID. Omit to list all players' game_visible documents."),
    })
  ),
  execute: async (args: { playerId?: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const where: Record<string, unknown> = {
      masterId: activeGame.currentMasterId,
      category: "game_visible",
      status: "active",
    };
    if (args.playerId) where.playerId = args.playerId;

    const docs = await prisma.document.findMany({
      where,
      select: { id: true, title: true, type: true, summary: true, playerId: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return docs;
  },
};
