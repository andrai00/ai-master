import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { parseFormulaBlocks } from "@/src/shared/lib/formula/parser";
import { evaluateFormulas } from "@/src/shared/lib/formula/evaluator";
import { normalizeReadContent } from "@/src/shared/lib/documents/read-normalize";
import { resolveDocId } from "../tools/resolve-doc-id";

export const gmReadDocumentTool = {
  description: "Read a document by ID, path, title, or a link target from a [[...]] wiki-link (e.g. 'races/217-plasmoid', 'glossary/races/217-plasmoid', 'Бой D&D 5e'). Works for all categories: glossary, brain, game_hidden, game_visible. Formula blocks (```formula) are evaluated on the WHOLE document and returned as formulaValues. Returns a toc (markdown headings with their character offsets) so you can jump directly to a section with offset. By default only the first 3000 chars are returned (with hasMore/totalSize) — pass offset/limit to read a specific slice or continue reading. Set offset explicitly to read further parts of a large document.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID), path, title, or a link target from a [[...]] wiki-link. Auto-resolves."),
      offset: z.number().optional().describe("Character offset for reading a section (default 0, or a toc heading offset)"),
      limit: z.number().optional().describe("Max characters of text to return (default 3000, hard cap 8000)"),
    })
  ),
  execute: async (args: { id: string; offset?: number; limit?: number }) => {
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

    // Formulas are always computed on the FULL document — slicing the text
    // must not break boundary formulas.
    const blocks = parseFormulaBlocks(content);
    const { results } = evaluateFormulas(blocks);
    const formulaValues: Record<string, number> = {};
    const formulaErrors: Record<string, string> = {};
    results.forEach((v) => {
      if (v.value !== null && !v.error) formulaValues[v.name] = v.value;
      else if (v.error) formulaErrors[v.name] = v.error;
    });

    const formulaData = {
      formulaValues: Object.keys(formulaValues).length > 0 ? formulaValues : undefined,
      formulaErrors: Object.keys(formulaErrors).length > 0 ? formulaErrors : undefined,
    };

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
