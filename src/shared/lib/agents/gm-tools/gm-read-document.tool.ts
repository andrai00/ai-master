import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { parseFormulaBlocks } from "@/src/shared/lib/formula/parser";
import { evaluateFormulas } from "@/src/shared/lib/formula/evaluator";

export const gmReadDocumentTool = {
  description: "Read a document by ID. Works for all categories: glossary, brain, game_hidden, game_visible. Formula blocks (```formula) are evaluated and returned as formulaValues.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID)"),
    })
  ),
  execute: async (args: { id: string }) => {
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

    const blocks = parseFormulaBlocks(doc.content);
    const { results, errors } = evaluateFormulas(blocks);
    const formulaValues: Record<string, number> = {};
    results.forEach((v) => { if (v.value !== null) formulaValues[v.name] = v.value; });

    return { ...doc, formulaValues: Object.keys(formulaValues).length > 0 ? formulaValues : undefined, formulaErrors: errors.length > 0 ? errors : undefined };
  },
};
