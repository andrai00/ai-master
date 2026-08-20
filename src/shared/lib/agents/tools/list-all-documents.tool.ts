import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

/**
 * Structural overview of the whole document corpus for the current game:
 * counts per category/type and the most recent titles. The glossary is huge
 * (thousands of docs) so it is NEVER listed — only counts, like Cursor's file
 * tree (names + sizes, content fetched on demand).
 */
export const listAllDocumentsTool = {
  description:
    "Structural overview of ALL documents of the current game: counts per category (glossary, brain, game_hidden, game_visible) and per type, plus the most recently updated titles. The glossary is huge — it shows only counts, never the full list. Call this ONCE to understand what exists before studying anything; then use search_rules / get_brain / get_gm_notes / read_document for details.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const masterId = activeGame.currentMasterId;
    const where = { masterId, status: "active" as const };

    const [byCategory, byType, recent] = await Promise.all([
      prisma.document.groupBy({ by: ["category"], where, _count: { _all: true } }),
      prisma.document.groupBy({ by: ["category", "type"], where, _count: { _all: true } }),
      prisma.document.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, category: true, type: true, updatedAt: true },
        take: 60,
      }),
    ]);

    const categories = byCategory.map((c) => ({
      category: c.category,
      total: c._count._all,
      types: byType
        .filter((t) => t.category === c.category)
        .map((t) => ({ type: t.type, count: t._count._all })),
    }));

    const recentTitles: Record<string, Array<{ id: string; title: string; type: string }>> = {};
    for (const r of recent) {
      const list = recentTitles[r.category] ?? [];
      if (list.length < 10) list.push({ id: r.id, title: r.title, type: r.type });
      recentTitles[r.category] = list;
    }

    return { categories, recentTitles };
  },
};
