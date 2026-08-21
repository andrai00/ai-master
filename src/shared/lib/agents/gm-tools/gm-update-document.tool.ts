import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { validateFormulaContent } from "../validate-formulas";
import { validateLinksContent } from "@/src/shared/lib/documents/validate-links";
import { supportsFormulaCategory } from "@/src/shared/lib/formula";
import { applyLineEdits, countLines, type TLineEdit } from "@/src/shared/lib/documents/line-utils";

export const gmUpdateDocumentTool = {
  description: "Update an existing document. Can update game_hidden and game_visible documents only. For a small change, pass edits (line-based, from a numbered read) instead of rewriting the whole content.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID)"),
      content: z.string().optional().describe("New document body in Markdown (FULL replace). Provide EITHER content OR edits — for a small change prefer edits (see below)."),
      title: z.string().optional().describe("New title (optional)"),
      summary: z.string().optional().describe("New summary (optional)"),
      edits: z
        .array(
          z.object({
            start_line: z.number().describe("1-based number of the first line to change (from a numbered read — read_document with numbered: true)"),
            end_line: z.number().optional().describe("1-based number of the last line to change (inclusive; default start_line). Set end_line = start_line - 1 to INSERT new_lines before start_line."),
            new_lines: z.string().optional().describe("Replacement text (may span multiple lines). Empty or missing deletes the range."),
          })
        )
        .optional()
        .describe("Surgical line edits applied to the CURRENT document content in one atomic write. Use for small changes instead of rewriting the whole content."),
    })
  ),
  execute: async (args: { id: string; content?: string; title?: string; summary?: string; edits?: TLineEdit[] }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    if (args.content === undefined && !args.edits) {
      throw new Error("errors.editRange: provide either content (full replace) or edits (line edits), not neither");
    }
    if (args.content !== undefined && args.edits) {
      throw new Error("errors.editRange: provide either content (full replace) or edits (line edits), not both");
    }

    const prisma = getPrisma();
    const existing = await prisma.document.findFirst({
      where: { id: args.id, masterId: activeGame.currentMasterId },
      select: { id: true, category: true, content: true },
    });
    if (!existing) throw new Error("errors.documentNotFound");
    if (existing.category === "glossary" || existing.category === "brain") {
      throw new Error("errors.cannotWriteInMode: glossary and brain are read-only in game mode");
    }

    const updateData: Record<string, unknown> = {};
    let applied: Array<{ start_line: number; end_line: number; replacedLines: number; insertedLines: number }> | undefined;

    if (args.edits) {
      const r = applyLineEdits(existing.content ?? "", args.edits);
      updateData.content = r.content;
      applied = r.applied;
    } else {
      updateData.content = args.content;
    }
    if (args.title !== undefined) updateData.title = args.title;
    if (args.summary !== undefined) updateData.summary = args.summary;

    await prisma.document.update({ where: { id: args.id }, data: updateData });
    broadcastGameEvent("document_updated", { masterId: activeGame.currentMasterId, documentId: args.id });
    return {
      id: args.id,
      updated: true,
      mode: args.edits ? "lines" : "full",
      applied,
      totalLines: countLines(String(updateData.content)),
      formulaValidation: supportsFormulaCategory(existing.category) ? validateFormulaContent(String(updateData.content)) : null,
      linkValidation: await validateLinksContent(prisma, activeGame.currentMasterId, existing.category, String(updateData.content)),
    };
  },
};
