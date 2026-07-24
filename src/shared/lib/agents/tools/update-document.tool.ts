import { z } from "zod";
import { zodSchema } from "@ai-sdk/provider-utils";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { assertNotGameMode } from "@/src/shared/lib/db/game-mode-guard";
import { throwIfCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";
import { assertCanWrite } from "./builder-mode-guard";

export const updateDocumentTool = {
  description: TOOL_DESCRIPTIONS.update_document,
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID to update"),
      content: z.string().describe("New Markdown content"),
      title: z.string().optional().describe("New title (optional)"),
      summary: z.string().optional().describe("New summary (optional)"),
    })
  ),
  execute: async (args: { id: string; content: string; title?: string; summary?: string }) => {
    throwIfCancelled();
    await assertNotGameMode();
    const prisma = getPrisma();

    const doc = await prisma.document.findUnique({
      where: { id: args.id },
      select: { category: true },
    });
    if (!doc) throw new Error("errors.documentNotFound");
    await assertCanWrite(doc.category);

    const data: Record<string, unknown> = { content: args.content };
    if (args.title !== undefined) data.title = args.title;
    if (args.summary !== undefined) data.summary = args.summary;

    const updated = await prisma.document.update({
      where: { id: args.id },
      data,
    });
    return { id: updated.id, title: updated.title, category: updated.category };
  },
};
