import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { parseFormulaBlocks } from "@/src/shared/lib/formula/parser";
import { evaluateFormulas } from "@/src/shared/lib/formula/evaluator";

export const gmReadDocumentTool = {
  description: "Read a document by ID. Works for all categories: glossary, brain, game_hidden, game_visible. Formula blocks (```formula) are evaluated on the WHOLE document and returned as formulaValues. Returns a toc (markdown headings with their character offsets) so you can jump directly to a section with offset. By default only the first 3000 chars are returned (with hasMore/totalSize) — pass offset/limit to read a specific slice or continue reading. Set offset explicitly to read further parts of a large document.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID)"),
      offset: z.number().optional().describe("Character offset for reading a section (default 0, or a toc heading offset)"),
      limit: z.number().optional().describe("Max characters of text to return (default 3000, hard cap 8000)"),
    })
  ),
  execute: async (args: { id: string; offset?: number; limit?: number }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    const prisma = getPrisma();
    const doc = await prisma.document.findFirst({
      where: { id: args.id, masterId: activeGame.currentMasterId },
      select: {
        id: true,
        title: true,
        category: true,
        type: true,
        summary: true,
        content: true,
        playerId: true,
        tags: true,
        updatedAt: true,
      },
    });
    if (!doc) throw new Error("errors.documentNotFound");

    // Table of contents — markdown headings with their offsets, so the model
    // can jump straight to the section it needs instead of reading from 0.
    const toc: Array<{ heading: string; offset: number }> = [];
    const headingRe = /^#{1,4}\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRe.exec(doc.content)) !== null) {
      toc.push({ heading: match[1]!.trim(), offset: match.index });
    }

    // Formulas are always computed on the FULL document — slicing the text
    // must not break boundary formulas.
    const blocks = parseFormulaBlocks(doc.content);
    const { results, errors } = evaluateFormulas(blocks);
    const formulaValues: Record<string, number> = {};
    results.forEach((v) => { if (v.value !== null) formulaValues[v.name] = v.value; });

    const formulaData = {
      formulaValues: Object.keys(formulaValues).length > 0 ? formulaValues : undefined,
      formulaErrors: errors.length > 0 ? errors : undefined,
    };

    // Always return a slice: default limit prevents dumping huge documents
    // (e.g. a 25KB mechanics section) into the model context in one call.
    // `limit` is hard-capped so the model cannot request the whole document.
    const offset = args.offset ?? 0;
    const limit = Math.min(args.limit ?? 3000, 8000);
    const totalSize = doc.content.length;
    const safeOffset = Math.min(offset, totalSize);
    const text = doc.content.slice(safeOffset, safeOffset + limit);
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      type: doc.type,
      summary: doc.summary,
      playerId: doc.playerId,
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
