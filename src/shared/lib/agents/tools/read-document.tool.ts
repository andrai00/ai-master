import { z } from "zod";
import { zodSchema } from "@ai-sdk/provider-utils";
import { getPrisma } from "@/src/shared/lib/db/prisma";

export const readDocumentTool = {
  description: "Read a document from the database by ID. Returns title, category, type, summary, and full content.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID to read"),
    })
  ),
  execute: async (args: { id: string }) => {
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
    if (!doc) throw new Error(`Document not found: ${args.id}`);
    return doc;
  },
};
