import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmSetSceneStateTool = {
  description: "Update the current scene state. Saves to a game_hidden document called 'Current Scene'. Use this to track scene location, NPCs present, active effects, etc.",
  inputSchema: zodSchema(
    z.object({
      content: z.string().describe("Scene state in Markdown. Describe the current location, NPCs, atmosphere, active effects, etc."),
    })
  ),
  execute: async (args: { content: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    const prisma = getPrisma();

    const existing = await prisma.document.findFirst({
      where: {
        masterId: activeGame.currentMasterId,
        title: "Current Scene",
        category: "game_hidden",
        type: "scene",
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.document.update({
        where: { id: existing.id },
        data: { content: args.content },
      });
      return { id: existing.id, updated: true };
    }

    const doc = await prisma.document.create({
      data: {
        masterId: activeGame.currentMasterId,
        title: "Current Scene",
        content: args.content,
        category: "game_hidden",
        type: "scene",
      },
    });
    return { id: doc.id, created: true };
  },
};
