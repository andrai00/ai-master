import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmSearchDocumentsTool = {
  description: "Search documents by query across all categories. Returns matching documents with titles, summaries, and content snippets.",
  inputSchema: zodSchema(
    z.object({
      query: z.string().describe("Search query"),
      category: z.enum(["glossary", "brain", "game_hidden", "game_visible"]).optional().describe("Filter by category"),
    })
  ),
  execute: async (args: { query: string; category?: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    const prisma = getPrisma();
    const where: Record<string, unknown> = {
      masterId: activeGame.currentMasterId,
      OR: [
        { title: { contains: args.query } },
        { summary: { contains: args.query } },
        { content: { contains: args.query } },
      ],
    };
    if (args.category) where.category = args.category;

    const docs = await prisma.document.findMany({
      where,
      select: { id: true, title: true, category: true, type: true, summary: true, playerId: true, content: true },
      take: 20,
    });

    return docs.map((d) => {
      const idx = d.content.toLowerCase().indexOf(args.query.toLowerCase());
      let snippet = "";
      if (idx !== -1) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(d.content.length, idx + args.query.length + 60);
        snippet = (start > 0 ? "..." : "") + d.content.slice(start, end) + (end < d.content.length ? "..." : "");
      }
      return {
        id: d.id,
        title: d.title,
        category: d.category,
        type: d.type,
        summary: d.summary,
        playerId: d.playerId,
        snippet: snippet || null,
      };
    });
  },
};
