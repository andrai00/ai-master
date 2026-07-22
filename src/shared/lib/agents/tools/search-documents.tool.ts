import { z } from "zod";
import { zodSchema } from "@ai-sdk/provider-utils";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { throwIfCancelled } from "@/src/shared/lib/agents/parse-cancel";

export const searchDocumentsTool = {
  description:
    "Full-text search across glossary and brain documents. Searches title, summary, and content.",
  inputSchema: zodSchema(
    z.object({
      query: z.string().describe("Search query"),
      category: z
        .enum(["glossary", "brain"])
        .optional()
        .describe("Filter by category (optional, searches both if omitted)"),
    })
  ),
  execute: async (args: { query: string; category?: "glossary" | "brain" }) => {
    throwIfCancelled();
    const activeGame = await getActiveGame();
    if (!activeGame) return [];

    const prisma = getPrisma();
    const docs = await prisma.document.findMany({
      where: {
        masterId: activeGame.currentMasterId,
        category: args.category ? args.category : { in: ["glossary", "brain"] },
        OR: [
          { title: { contains: args.query } },
          { summary: { contains: args.query } },
          { content: { contains: args.query } },
        ],
      },
      select: {
        id: true,
        title: true,
        category: true,
        type: true,
        summary: true,
        content: true,
      },
      take: 10,
    });
    return docs;
  },
};
