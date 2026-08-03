import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";
import { getReadableCategories } from "./builder-mode-guard";

interface IMatchContext {
  heading: string | null;
  snippet: string;
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/gm;

function findClosestHeading(content: string, position: number): string | null {
  let lastHeading: string | null = null;
  let match: RegExpExecArray | null;
  HEADING_RE.lastIndex = 0;
  while ((match = HEADING_RE.exec(content)) !== null) {
    if (match.index >= position) break;
    lastHeading = match[2].trim();
  }
  return lastHeading;
}

function makeSnippet(content: string, query: string): string | null {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - 80);
  const end = Math.min(content.length, idx + query.length + 80);
  let snippet = content.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";
  return snippet;
}

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

    const docs = await prisma.document.findMany({
      where,
      select: { id: true, title: true, category: true, type: true, summary: true, content: !!args.query },
      take: 50,
    });

    if (!args.query || docs.length === 0) {
      return docs.map((d) => ({ id: d.id, title: d.title, category: d.category, type: d.type, summary: d.summary }));
    }

    const query = args.query;

    return docs.map((d) => {
      const base = { id: d.id, title: d.title, category: d.category, type: d.type, summary: d.summary };
      if (!d.content) return base;

      const idx = d.content.toLowerCase().indexOf(query.toLowerCase());
      const context: IMatchContext = {
        heading: idx !== -1 ? findClosestHeading(d.content, idx) : null,
        snippet: makeSnippet(d.content, query) ?? "",
      };
      return { ...base, context };
    });
  },
};
