import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { validateFormulaContent } from "../validate-formulas";
import { validateLinksContent } from "@/src/shared/lib/documents/validate-links";
import { supportsFormulaCategory } from "@/src/shared/lib/formula";

export const gmWriteNoteTool = {
  description: "Write a hidden note for yourself (game_hidden). Use for auto-summaries, plans, observations, and memory. Returns formulaValidation (check and fix formula errors) and linkValidation.",
  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("Note title (e.g. 'Session Summary #3', 'Plan for next scene')"),
      content: z.string().describe("Note content in Markdown"),
    })
  ),
  execute: async (args: { title: string; content: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    const prisma = getPrisma();

    const existing = await prisma.document.findFirst({
      where: {
        masterId: activeGame.currentMasterId,
        title: args.title,
        category: "game_hidden",
        type: "note",
      },
      select: { id: true, title: true },
    });

    if (existing) {
      await prisma.document.update({
        where: { id: existing.id },
        data: { content: args.content },
      });
      broadcastGameEvent("document_updated", { masterId: activeGame.currentMasterId, documentId: existing.id });
      return {
        id: existing.id,
        title: existing.title,
        updated: true,
        formulaValidation: supportsFormulaCategory("game_hidden") ? validateFormulaContent(args.content) : null,
        linkValidation: await validateLinksContent(prisma, activeGame.currentMasterId, "game_hidden", args.content),
      };
    }

    const doc = await prisma.document.create({
      data: {
        masterId: activeGame.currentMasterId,
        title: args.title,
        content: args.content,
        category: "game_hidden",
        type: "note",
      },
    });
    broadcastGameEvent("document_created", { masterId: activeGame.currentMasterId, documentId: doc.id });
    return {
      id: doc.id,
      title: doc.title,
      created: true,
      formulaValidation: supportsFormulaCategory("game_hidden") ? validateFormulaContent(args.content) : null,
      linkValidation: await validateLinksContent(prisma, activeGame.currentMasterId, "game_hidden", args.content),
    };
  },
};
