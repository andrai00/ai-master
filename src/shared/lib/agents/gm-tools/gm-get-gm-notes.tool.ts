import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmGetGmNotesTool = {
  description:
    "List YOUR hidden notes and game memory (game_hidden documents): scene state, plans, observations, the secret actions log. Returns ids and titles; read a specific note with read_document. Pass playerId to list only that player's per-player notes. Do not confuse these with player data or rules.",
  inputSchema: zodSchema(
    z.object({
      playerId: z.string().optional().describe("Filter to only this player's hidden notes. Omit for all."),
    })
  ),
  execute: async (args: { playerId?: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const docs = await prisma.document.findMany({
      where: {
        masterId: activeGame.currentMasterId,
        category: "game_hidden",
        status: "active",
        ...(args.playerId ? { playerId: args.playerId } : {}),
      },
      select: { id: true, title: true, type: true, summary: true, playerId: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return docs.map((d) => ({ ...d, source: "game_hidden" }));
  },
};
