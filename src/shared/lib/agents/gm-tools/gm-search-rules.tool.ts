import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmSearchRulesTool = {
  description:
    "Search RULES (glossary) by keywords. The glossary is a huge read-only corpus — never dump it into the conversation. Returns matching ids, titles, snippets, and how many total matches there are; read a full document with read_document afterwards. Optionally filter by a document type (see glossary_overview for the list of types). Use for rules, spells, items, monsters, conditions — anything from the game rules. If total is much larger than returned, narrow the query or filter by type.",
  inputSchema: zodSchema(
    z.object({
      query: z.string().describe("Search query — a keyword or phrase from the rules"),
      type: z.string().optional().describe("Optional filter: only search documents of this type (e.g. 'monster', 'spell', 'item'). Use glossary_overview to see available types."),
      limit: z.number().optional().describe("Max results to return (default 20, max 50)"),
    })
  ),
  execute: async (args: { query: string; type?: string; limit?: number }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const take = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const where = {
      masterId: activeGame.currentMasterId,
      category: "glossary" as const,
      status: "active" as const,
      ...(args.type ? { type: args.type } : {}),
      OR: [
        { title: { contains: args.query } },
        { summary: { contains: args.query } },
        { content: { contains: args.query } },
      ],
    };

    const [docs, total] = await Promise.all([
      prisma.document.findMany({
        where,
        select: { id: true, title: true, type: true, summary: true, content: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take,
      }),
      prisma.document.count({ where }),
    ]);

    const results = docs.map((d) => {
      const idx = d.content.toLowerCase().indexOf(args.query.toLowerCase());
      let snippet = "";
      if (idx !== -1) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(d.content.length, idx + args.query.length + 60);
        snippet = (start > 0 ? "..." : "") + d.content.slice(start, end) + (end < d.content.length ? "..." : "");
      }
      return { id: d.id, title: d.title, type: d.type, summary: d.summary, snippet: snippet || null, updatedAt: d.updatedAt, source: "glossary" };
    });

    return { total, returned: results.length, docs: results };
  },
};
