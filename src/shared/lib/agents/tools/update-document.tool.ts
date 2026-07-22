import { z } from "zod";
import { zodSchema } from "@ai-sdk/provider-utils";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { assertNotGameMode } from "@/src/shared/lib/db/game-mode-guard";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";

export const updateDocumentTool = {
  description: "Update the content of an existing glossary or brain document.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID to update"),
      content: z.string().describe("New Markdown content"),
      title: z.string().optional().describe("New title (optional)"),
      summary: z.string().optional().describe("New summary (optional)"),
    })
  ),
  execute: async (args: { id: string; content: string; title?: string; summary?: string }) => {
    if (isCancelled()) throw new Error("Cancelled.");
    await assertNotGameMode();
    const prisma = getPrisma();

    const data: Record<string, unknown> = { content: args.content };
    if (args.title !== undefined) data.title = args.title;
    if (args.summary !== undefined) data.summary = args.summary;

    const doc = await prisma.document.update({
      where: { id: args.id },
      data,
    });
    return { id: doc.id, title: doc.title, category: doc.category };
  },
};
