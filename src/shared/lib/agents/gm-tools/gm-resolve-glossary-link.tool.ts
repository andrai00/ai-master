import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmResolveGlossaryLinkTool = {
  description:
    "Resolve a glossary document title to its document ID (UUID) so you can create a wiki-link. Call it BEFORE writing [[...]] in a chat message or document content — wiki-links only work with the raw UUID, never with a title. Only glossary documents (rules) can be referenced this way.",
  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("A glossary document title, exact or partial"),
    })
  ),
  execute: async (args: { title: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const docs = await prisma.document.findMany({
      where: {
        masterId: activeGame.currentMasterId,
        category: "glossary",
        status: "active",
        title: { contains: args.title },
      },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
      take: 8,
    });

    return { matches: docs.map((d) => ({ id: d.id, title: d.title })) };
  },
};
