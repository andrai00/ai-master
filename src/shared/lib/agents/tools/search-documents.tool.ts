import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";
import { getReadableCategories } from "./builder-mode-guard";

export const searchDocumentsTool = {
  description: TOOL_DESCRIPTIONS.search_documents,
  inputSchema: zodSchema(
    z.object({
      query: z.string().describe("Search query"),
      category: z
        .enum(["glossary", "brain"])
        .optional()
        .describe("Filter by category (optional, searches all readable categories if omitted)"),
    })
  ),
  execute: async (args: { query: string; category?: "glossary" | "brain" }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    const activeGame = await getActiveGame();
    if (!activeGame) return [];

    const readableCategories = await getReadableCategories();

    // If a specific category filter is given, respect it (but only if readable)
    const categoryFilter = args.category
      ? (readableCategories.includes(args.category) ? args.category : readableCategories)
      : readableCategories;

    const prisma = getPrisma();
    const docs = await prisma.document.findMany({
      where: {
        masterId: activeGame.currentMasterId,
        category: Array.isArray(categoryFilter) ? { in: categoryFilter } : categoryFilter,
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
      take: 20,
    });
    return docs;
  },
};
