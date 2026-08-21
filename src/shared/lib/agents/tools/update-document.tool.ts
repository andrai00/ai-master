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
import { validateLinksContent } from "@/src/shared/lib/documents/validate-links";
import { supportsFormulaCategory } from "@/src/shared/lib/formula";
import { applyLineEdits, countLines, type TLineEdit } from "@/src/shared/lib/documents/line-utils";

export const updateDocumentTool = {
  description: TOOL_DESCRIPTIONS.update_document,
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID) or path (e.g. 'spells/207-faerie_fire'). Auto-resolves."),
      content: z.string().optional().describe("New Markdown content (FULL replace). Provide EITHER content OR edits — for a small change prefer edits (see below)."),
      title: z.string().optional().describe("New title (optional)"),
      summary: z.string().optional().describe("New summary (optional)"),
      edits: z
        .array(
          z.object({
            start_line: z.number().describe("1-based number of the first line to change (from a numbered read — read_document with numbered: true)"),
            end_line: z.number().optional().describe("1-based number of the last line to change (inclusive; default start_line). Set end_line = start_line - 1 to INSERT new_lines before start_line."),
            new_lines: z.string().optional().describe("Replacement text (may span multiple lines). Empty or missing deletes the range. To replace with a single empty line, use a blank string followed by a newline or include surrounding context."),
          })
        )
        .optional()
        .describe("Surgical line edits applied to the CURRENT document content in one atomic write. Use for small changes instead of rewriting the whole content. Multiple disjoint edits are allowed in one call; line numbers are 1-based from the numbered read and stay valid for all edits in the same call."),
    })
  ),
  execute: async (args: { id: string; content?: string; title?: string; summary?: string; edits?: TLineEdit[] }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    await assertNotGameMode();
    const prisma = getPrisma();

    if (args.content === undefined && !args.edits) {
      throw new Error("errors.editRange: provide either content (full replace) or edits (line edits), not neither");
    }
    if (args.content !== undefined && args.edits) {
      throw new Error("errors.editRange: provide either content (full replace) or edits (line edits), not both");
    }

    const resolvedId = await resolveDocId(args.id);
    if (!resolvedId) throw new Error("errors.documentNotFound");

    const doc = await prisma.document.findUnique({
      where: { id: resolvedId },
      select: { category: true, content: true },
    });
    if (!doc) throw new Error("errors.documentNotFound");
    await assertCanWrite(doc.category);

    const data: Record<string, unknown> = {};
    let applied: Array<{ start_line: number; end_line: number; replacedLines: number; insertedLines: number }> | undefined;

    if (args.edits) {
      const r = applyLineEdits(doc.content ?? "", args.edits);
      data.content = r.content;
      applied = r.applied;
    } else {
      data.content = args.content;
    }
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
      mode: args.edits ? "lines" : "full",
      applied,
      totalLines: countLines(String(data.content)),
      formulaValidation: supportsFormulaCategory(updated.category) ? validateFormulaContent(String(data.content)) : null,
      linkValidation: await validateLinksContent(prisma, updated.masterId, updated.category, String(data.content)),
    };
  },
};
