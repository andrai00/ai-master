import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmGetBrainTool = {
  description:
    "Read YOUR operating instructions (brain documents). The brain is small — usually an index file plus a few sections — and defines how to run this game, the character creation order, and message routing. Call get_brain() first to get the index and section list; optionally pass a topic to read one section in full. Do NOT search the glossary for instructions — they live here.",
  inputSchema: zodSchema(
    z.object({
      topic: z.string().optional().describe("Optional — a section title or topic to read in full"),
    })
  ),
  execute: async (args: { topic?: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();

    if (args.topic) {
      const doc = await prisma.document.findFirst({
        where: {
          masterId: activeGame.currentMasterId,
          category: "brain",
          status: "active",
          title: { contains: args.topic },
        },
        select: { id: true, title: true, type: true, content: true },
      });
      if (!doc) return { matches: [] };
      return { matches: [{ id: doc.id, title: doc.title, type: doc.type, content: doc.content }] };
    }

    const docs = await prisma.document.findMany({
      where: { masterId: activeGame.currentMasterId, category: "brain", status: "active" },
      select: { id: true, title: true, type: true, summary: true, content: true },
      orderBy: [{ type: "asc" }, { title: "asc" }],
    });

    const indexDoc = docs.find((d) => d.type === "_index") ?? null;

    return {
      index: indexDoc
        ? { id: indexDoc.id, title: indexDoc.title, type: indexDoc.type, content: indexDoc.content }
        : null,
      sections: docs
        .filter((d) => d.id !== indexDoc?.id)
        .map((d) => ({ id: d.id, title: d.title, type: d.type, summary: d.summary })),
    };
  },
};
