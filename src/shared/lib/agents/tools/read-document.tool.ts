import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";
import { assertCanRead } from "./builder-mode-guard";

export const readDocumentTool = {
  description: TOOL_DESCRIPTIONS.read_document,
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID to read"),
      offset: z.number().optional().describe("Character offset for chunked reading (default 0 = full document)"),
      limit: z.number().optional().describe("Max characters for chunked reading (omit for full document)"),
    })
  ),
  execute: async (args: { id: string; offset?: number; limit?: number }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    const prisma = getPrisma();

    const doc = await prisma.document.findUnique({
      where: { id: args.id },
      select: {
        id: true,
        title: true,
        category: true,
        type: true,
        summary: true,
        content: true,
        tags: true,
      },
    });
    if (!doc) throw new Error("errors.documentNotFound");
    await assertCanRead(doc.category);

    if (args.offset !== undefined || args.limit !== undefined) {
      const offset = args.offset ?? 0;
      const limit = args.limit ?? 5000;
      const totalSize = doc.content.length;
      const safeOffset = Math.min(offset, totalSize);
      const chunk = doc.content.slice(safeOffset, safeOffset + limit);
      const hasMore = safeOffset + limit < totalSize;
      return {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        type: doc.type,
        summary: doc.summary,
        text: chunk,
        offset: safeOffset,
        length: chunk.length,
        totalSize,
        hasMore,
      };
    }

    return doc;
  },
};
