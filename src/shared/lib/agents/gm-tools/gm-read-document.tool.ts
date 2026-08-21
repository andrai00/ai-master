import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { parseFormulaBlocks } from "@/src/shared/lib/formula/parser";
import { evaluateFormulas } from "@/src/shared/lib/formula/evaluator";
import { normalizeReadContent } from "@/src/shared/lib/documents/read-normalize";
import { resolveDocId } from "../tools/resolve-doc-id";
import { supportsFormulaCategory } from "@/src/shared/lib/formula";
import { numberLines } from "@/src/shared/lib/documents/line-utils";

export const gmReadDocumentTool = {
  description: "Read a document by ID, path, title, or a link target from a [[...]] wiki-link (e.g. 'races/217-plasmoid', 'glossary/races/217-plasmoid', 'Бой D&D 5e'). Works for all categories: glossary, brain, game_hidden, game_visible. Formula blocks (```formula) are evaluated on the WHOLE document and returned as formulaValues. Returns a toc (markdown headings with their character offsets) so you can jump directly to a section with offset. By default only the first 3000 chars are returned (with hasMore/totalSize) — pass offset/limit to read a specific slice or continue reading. Set offset explicitly to read further parts of a large document. To EDIT specific lines, pass numbered: true — the document is returned as absolute 1-based numbered lines (with start_line/line_limit paging), which you then target in update_document edits.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID), path, title, or a link target from a [[...]] wiki-link. Auto-resolves."),
      offset: z.number().optional().describe("Character offset for reading a section (default 0, or a toc heading offset)"),
      limit: z.number().optional().describe("Max characters of text to return (default 3000, hard cap 8000)"),
      numbered: z.boolean().optional().describe("When true, return the document as absolute 1-based numbered lines (`   12 | content`) instead of a character slice — use the numbers to edit specific lines via update_document edits. Character offset/limit are ignored in numbered mode."),
      start_line: z.number().optional().describe("First line to return in numbered mode (1-based, default 1)"),
      line_limit: z.number().optional().describe("Max lines to return in numbered mode (default 400)"),
    })
  ),
  execute: async (args: { id: string; offset?: number; limit?: number; numbered?: boolean; start_line?: number; line_limit?: number }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    const prisma = getPrisma();
    const resolvedId = await resolveDocId(args.id);
    const docId = resolvedId ?? args.id;
    const doc = await prisma.document.findFirst({
      where: { id: docId, masterId: activeGame.currentMasterId },
      select: {
        id: true,
        title: true,
        category: true,
        type: true,
        summary: true,
        content: true,
        playerId: true,
        tags: true,
        path: true,
        updatedAt: true,
      },
    });
    if (!doc) throw new Error("errors.documentNotFound");

    // The model always sees glossary/ prefixed links — normalize archive-style
    // internal links on the fly (storage stays as imported).
    const content = await normalizeReadContent(prisma, activeGame.currentMasterId, doc.category, doc.content);

    // Table of contents — markdown headings with their offsets, so the model
    // can jump straight to the section it needs instead of reading from 0.
    const toc: Array<{ heading: string; offset: number }> = [];
    const headingRe = /^#{1,4}\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRe.exec(content)) !== null) {
      toc.push({ heading: match[1]!.trim(), offset: match.index });
    }

    // Formulas are only meaningful on character sheets and master memory;
    // brain/glossary documents hold formula EXAMPLES and must not be evaluated.
    const formulaData = supportsFormulaCategory(doc.category)
      ? (() => {
          const blocks = parseFormulaBlocks(content);
          const { results } = evaluateFormulas(blocks);
          const formulaValues: Record<string, number> = {};
          const formulaErrors: Record<string, string> = {};
          results.forEach((v) => {
            if (v.value !== null && !v.error) formulaValues[v.name] = v.value;
            else if (v.error) formulaErrors[v.name] = v.line ? `${v.error} (line ${v.line})` : v.error;
          });
          return {
            formulaValues: Object.keys(formulaValues).length > 0 ? formulaValues : undefined,
            formulaErrors: Object.keys(formulaErrors).length > 0 ? formulaErrors : undefined,
          };
        })()
      : {};

    // Numbered view: absolute 1-based line numbers so the model can target
    // exact lines in update_document edits. start_line/line_limit page it.
    if (args.numbered) {
      const num = numberLines(content, args.start_line ?? 1, args.line_limit ?? 400);
      return {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        type: doc.type,
        summary: doc.summary,
        playerId: doc.playerId,
        path: doc.path,
        source: doc.category,
        updatedAt: doc.updatedAt,
        mode: "numbered",
        lines: num.view,
        startLine: num.startLine,
        endLine: num.endLine,
        totalLines: num.totalLines,
        hasMore: num.hasMore,
        toc,
        ...formulaData,
      };
    }

    // Always return a slice: default limit prevents dumping huge documents
    // (e.g. a 25KB mechanics section) into the model context in one call.
    // `limit` is hard-capped so the model cannot request the whole document.
    const offset = args.offset ?? 0;
    const limit = Math.min(args.limit ?? 3000, 8000);
    const totalSize = content.length;
    const safeOffset = Math.min(offset, totalSize);
    const text = content.slice(safeOffset, safeOffset + limit);
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      type: doc.type,
      summary: doc.summary,
      playerId: doc.playerId,
      path: doc.path,
      source: doc.category,
      updatedAt: doc.updatedAt,
      toc,
      text,
      offset: safeOffset,
      length: text.length,
      totalSize,
      hasMore: safeOffset + text.length < totalSize,
      ...formulaData,
    };
  },
};
