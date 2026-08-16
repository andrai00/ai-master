import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";

export const gmGetPlayerSheetTool = {
  description:
    "Get a player's character data (game_visible documents linked to them: character sheet, personal records). In personal chat call it WITHOUT playerId — it returns the current player's data. In game chat pass the playerId. Call it FIRST when a player talks to you.",
  inputSchema: zodSchema(
    z.object({
      playerId: z.string().optional().describe("Player ID. Omit in personal chat to get the current player's data."),
    })
  ),
  execute: async (args: { playerId?: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();

    let pid = args.playerId;
    if (!pid) {
      const session = await getSession();
      if (!session) throw new Error("errors.forbidden");
      pid = session.userId;
    }

    const docs = await prisma.document.findMany({
      where: { masterId: activeGame.currentMasterId, category: "game_visible", playerId: pid, status: "active" },
      select: { id: true, title: true, type: true, summary: true },
      orderBy: { updatedAt: "desc" },
    });

    return { playerId: pid, documents: docs };
  },
};
