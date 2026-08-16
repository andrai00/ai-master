import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmSearchRulesTool = {
  description:
    "Search RULES (glossary) by keywords. The glossary is a huge read-only corpus — never dump it into the conversation. Returns matching ids, titles and snippets; read a full document with read_document afterwards. Use for rules, spells, items, monsters, conditions — anything from the game rules.",
  inputSchema: zodSchema(
    z.object({
      query: z.string().describe("Search query — a keyword or phrase from the rules"),
    })
  ),
  execute: async (args: { query: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const docs = await prisma.document.findMany({
      where: {
        masterId: activeGame.currentMasterId,
        category: "glossary",
        status: "active",
        OR: [
          { title: { contains: args.query } },
          { summary: { contains: args.query } },
          { content: { contains: args.query } },
        ],
      },
      select: { id: true, title: true, type: true, summary: true, content: true },
      orderBy: { updatedAt: "desc" },
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
      return { id: d.id, title: d.title, type: d.type, summary: d.summary, snippet: snippet || null };
    });
  },
};
