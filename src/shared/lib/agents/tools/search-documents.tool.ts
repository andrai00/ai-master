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
      query: z.string().optional().describe("Search query (omit to list all readable documents)"),
      category: z
        .enum(["glossary", "brain"])
        .optional()
        .describe("Filter by category (optional, searches all readable categories if omitted)"),
    })
  ),
  execute: async (args: { query?: string; category?: "glossary" | "brain" }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    const activeGame = await getActiveGame();
    if (!activeGame) return [];

    const readableCategories = await getReadableCategories();

    const categoryFilter = args.category
      ? (readableCategories.includes(args.category) ? args.category : readableCategories)
      : readableCategories;

    const prisma = getPrisma();
    const where: Record<string, unknown> = {
      masterId: activeGame.currentMasterId,
      category: Array.isArray(categoryFilter) ? { in: categoryFilter } : categoryFilter,
    };

    if (args.query) {
      where.OR = [
        { title: { contains: args.query } },
        { summary: { contains: args.query } },
        { content: { contains: args.query } },
      ];
    }

    const select = args.query
      ? { id: true, title: true, category: true, type: true, summary: true, content: true }
      : { id: true, title: true, category: true, type: true, summary: true }; // no content for list-all

    const docs = await prisma.document.findMany({
      where,
      select,
      take: 50,
    });
    return docs;
  },
};
