import { z } from "zod";
import { zodSchema } from "@ai-sdk/provider-utils";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { throwIfCancelled } from "@/src/shared/lib/agents/parse-cancel";

export const readDocumentTool = {
  description: "Read a document from the database by ID. Returns title, category, type, summary, and full content.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID to read"),
    })
  ),
  execute: async (args: { id: string }) => {
    throwIfCancelled();
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
    return doc;
  },
};
