import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { applyLineEdits, countLines, type TLineEdit } from "@/src/shared/lib/documents/line-utils";
import { validateFormulaContent } from "../validate-formulas";
import { validateLinksContent } from "@/src/shared/lib/documents/validate-links";
import { supportsFormulaCategory } from "@/src/shared/lib/formula";

export const gmUpdateCharSheetTool = {
  description: "Update a player's character sheet (game_visible document). Find the sheet by searching for the player's documents, then update it. For a small change (one stat, one line), pass edits (line-based, from a numbered read of the sheet) instead of rewriting the whole sheet. Returns formulaValidation (check and fix formula errors) and linkValidation.",
  inputSchema: zodSchema(
    z.object({
      playerId: z.string().describe("Player ID whose character sheet to update"),
      title: z.string().optional().describe("Title of the character sheet document. If omitted, finds the first game_visible doc for this player."),
      content: z.string().optional().describe("New character sheet content in Markdown (FULL replace). Provide EITHER content OR edits — for a small change prefer edits (see below)."),
      summary: z.string().optional().describe("Updated summary"),
      edits: z
        .array(
          z.object({
            start_line: z.number().describe("1-based number of the first line to change (from a numbered read — read_document with numbered: true)"),
            end_line: z.number().optional().describe("1-based number of the last line to change (inclusive; default start_line). Set end_line = start_line - 1 to INSERT new_lines before start_line."),
            new_lines: z.string().optional().describe("Replacement text (may span multiple lines). Empty or missing deletes the range."),
          })
        )
        .optional()
        .describe("Surgical line edits applied to the CURRENT sheet content in one atomic write. Use for small changes instead of rewriting the whole sheet."),
    })
  ),
  execute: async (args: { playerId: string; title?: string; content?: string; summary?: string; edits?: TLineEdit[] }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    if (args.content === undefined && !args.edits) {
      throw new Error("errors.editRange: provide either content (full replace) or edits (line edits), not neither");
    }
    if (args.content !== undefined && args.edits) {
      throw new Error("errors.editRange: provide either content (full replace) or edits (line edits), not both");
    }

    const prisma = getPrisma();

    const where: Record<string, unknown> = {
      masterId: activeGame.currentMasterId,
      category: "game_visible",
      playerId: args.playerId,
    };
    if (args.title) where.title = args.title;

    const doc = await prisma.document.findFirst({
      where,
      select: { id: true, title: true, category: true, content: true },
    });

    if (!doc) {
      if (args.edits) {
        throw new Error("errors.documentNotFound: cannot apply line edits — the character sheet does not exist yet. Create it with content (full text) first.");
      }
      const content = args.content ?? "";
      const created = await prisma.document.create({
        data: {
          masterId: activeGame.currentMasterId,
          title: args.title ?? `Character Sheet — ${args.playerId}`,
          content,
          category: "game_visible",
          type: "character_sheet",
          playerId: args.playerId,
          summary: args.summary ?? null,
        },
      });
      broadcastGameEvent("document_created", { masterId: activeGame.currentMasterId, documentId: created.id });
      return {
        id: created.id,
        title: created.title,
        created: true,
        formulaValidation: supportsFormulaCategory("game_visible") ? validateFormulaContent(content) : null,
        linkValidation: await validateLinksContent(prisma, activeGame.currentMasterId, "game_visible", content),
      };
    }

    const updateData: Record<string, unknown> = {};
    let applied: Array<{ start_line: number; end_line: number; replacedLines: number; insertedLines: number }> | undefined;

    if (args.edits) {
      const r = applyLineEdits(doc.content ?? "", args.edits);
      updateData.content = r.content;
      applied = r.applied;
    } else {
      updateData.content = args.content;
    }
    if (args.summary !== undefined) updateData.summary = args.summary;
    if (args.title !== undefined) updateData.title = args.title;

    await prisma.document.update({ where: { id: doc.id }, data: updateData });
    broadcastGameEvent("document_updated", { masterId: activeGame.currentMasterId, documentId: doc.id });
    return {
      id: doc.id,
      title: doc.title,
      updated: true,
      mode: args.edits ? "lines" : "full",
      applied,
      totalLines: countLines(String(updateData.content)),
      formulaValidation: supportsFormulaCategory(doc.category) ? validateFormulaContent(String(updateData.content)) : null,
      linkValidation: await validateLinksContent(prisma, activeGame.currentMasterId, doc.category, String(updateData.content)),
    };
  },
};
