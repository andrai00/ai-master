import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { assertNotGameMode } from "@/src/shared/lib/db/game-mode-guard";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";
import { assertCanWrite } from "./builder-mode-guard";
import { resolveDocId } from "./resolve-doc-id";
import { validateFormulaContent } from "../validate-formulas";

export const updateDocumentTool = {
  description: TOOL_DESCRIPTIONS.update_document,
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID) or path (e.g. 'spells/207-faerie_fire'). Auto-resolves."),
      content: z.string().describe("New Markdown content"),
      title: z.string().optional().describe("New title (optional)"),
      summary: z.string().optional().describe("New summary (optional)"),
    })
  ),
  execute: async (args: { id: string; content: string; title?: string; summary?: string }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    await assertNotGameMode();
    const prisma = getPrisma();

    const resolvedId = await resolveDocId(args.id);
    if (!resolvedId) throw new Error("errors.documentNotFound");

    const doc = await prisma.document.findUnique({
      where: { id: resolvedId },
      select: { category: true },
    });
    if (!doc) throw new Error("errors.documentNotFound");
    await assertCanWrite(doc.category);

    const data: Record<string, unknown> = { content: args.content };
    if (args.title !== undefined) data.title = args.title;
    if (args.summary !== undefined) data.summary = args.summary;

    const updated = await prisma.document.update({
      where: { id: resolvedId },
      data,
    });
    broadcastGameEvent("document_updated", { masterId: updated.masterId, documentId: updated.id });
    return {
      id: updated.id,
      title: updated.title,
      category: updated.category,
      formulaValidation: validateFormulaContent(args.content),
    };
  },
};
