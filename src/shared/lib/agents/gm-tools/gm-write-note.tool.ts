import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmWriteNoteTool = {
  description: "Write a hidden note for yourself (game_hidden). Use for auto-summaries, plans, observations, and memory.",
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
      return { id: existing.id, title: existing.title, updated: true };
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
    return { id: doc.id, title: doc.title, created: true };
  },
};
