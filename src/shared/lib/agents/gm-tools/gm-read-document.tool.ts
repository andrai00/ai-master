import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { parseFormulaBlocks } from "@/src/shared/lib/formula/parser";
import { evaluateFormulas } from "@/src/shared/lib/formula/evaluator";

export const gmReadDocumentTool = {
  description: "Read a document by ID. Works for all categories: glossary, brain, game_hidden, game_visible. Formula blocks (```formula) are evaluated on the WHOLE document and returned as formulaValues. Optional offset/limit slice only the returned text (formulas are still computed on the full document). Omit offset/limit for a whole read.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID)"),
      offset: z.number().optional().describe("Character offset for reading a section (default 0)"),
      limit: z.number().optional().describe("Max characters of text to return (omit for the whole document)"),
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
      },
    });
    if (!doc) throw new Error("errors.documentNotFound");

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

    if (args.offset !== undefined || args.limit !== undefined) {
      const offset = args.offset ?? 0;
      const limit = args.limit ?? 5000;
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
        text,
        offset: safeOffset,
        length: text.length,
        totalSize,
        hasMore: safeOffset + text.length < totalSize,
        ...formulaData,
      };
    }

    return { ...doc, source: doc.category, ...formulaData };
  },
};
