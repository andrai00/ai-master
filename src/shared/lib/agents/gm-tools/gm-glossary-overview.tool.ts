import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmGlossaryOverviewTool = {
  description:
    "Map of the glossary: how many documents each type has (e.g. monster, spell, item, feat, race, class, background, rule, lore, article), with a few sample titles per type. Call this ONCE to understand the glossary structure without dumping its contents. For specific rules use search_rules(query, type?).",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const grouped = await prisma.document.groupBy({
      by: ["type"],
      where: { masterId: activeGame.currentMasterId, category: "glossary", status: "active" },
      _count: { _all: true },
      orderBy: { type: "asc" },
    });

    const samples = await prisma.document.findMany({
      where: { masterId: activeGame.currentMasterId, category: "glossary", status: "active" },
      select: { id: true, title: true, type: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    const samplesByType = new Map<string, string[]>();
    for (const s of samples) {
      const list = samplesByType.get(s.type) ?? [];
      if (list.length < 3) list.push(s.title);
      samplesByType.set(s.type, list);
    }

    return {
      totalDocuments: grouped.reduce((sum, g) => sum + g._count._all, 0),
      types: grouped.map((g) => ({
        type: g.type,
        count: g._count._all,
        samples: samplesByType.get(g.type) ?? [],
      })),
      source: "glossary",
    };
  },
};
