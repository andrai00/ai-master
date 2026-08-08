import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmReadDocumentTool = {
  description: "Read a document by ID. Works for all categories: glossary, brain, game_hidden, game_visible.",
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
    return doc;
  },
};
