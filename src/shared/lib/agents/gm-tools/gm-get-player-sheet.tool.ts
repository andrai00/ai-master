import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";

export const gmGetPlayerSheetTool = {
  description:
    "Get a player's character data: their game_visible documents (character sheet, personal records) AND their per-player game_hidden notes (character creation progress, private GM notes about them). Hidden notes are for YOU only — never shown to the player. In personal chat call it WITHOUT playerId — it returns the current player's data. In game chat pass the playerId. Call it FIRST when a player talks to you. Never mix players: each call returns ONE player's documents.",
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

    const [visible, hidden] = await Promise.all([
      prisma.document.findMany({
        where: { masterId: activeGame.currentMasterId, category: "game_visible", playerId: pid, status: "active" },
        select: { id: true, title: true, type: true, summary: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.document.findMany({
        where: { masterId: activeGame.currentMasterId, category: "game_hidden", playerId: pid, status: "active" },
        select: { id: true, title: true, type: true, summary: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    return {
      playerId: pid,
      documents: [
        ...visible.map((d) => ({ ...d, source: "game_visible" })),
        ...hidden.map((d) => ({ ...d, source: "game_hidden" })),
      ],
    };
  },
};
