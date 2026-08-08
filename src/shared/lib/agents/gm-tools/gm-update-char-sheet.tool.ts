import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmUpdateCharSheetTool = {
  description: "Update a player's character sheet (game_visible document). Find the sheet by searching for the player's documents, then update it.",
  inputSchema: zodSchema(
    z.object({
      playerId: z.string().describe("Player ID whose character sheet to update"),
      title: z.string().optional().describe("Title of the character sheet document. If omitted, finds the first game_visible doc for this player."),
      content: z.string().describe("New character sheet content in Markdown"),
      summary: z.string().optional().describe("Updated summary"),
    })
  ),
  execute: async (args: { playerId: string; title?: string; content: string; summary?: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    const prisma = getPrisma();

    const where: Record<string, unknown> = {
      masterId: activeGame.currentMasterId,
      category: "game_visible",
      playerId: args.playerId,
    };
    if (args.title) where.title = args.title;

    const doc = await prisma.document.findFirst({
      where,
      select: { id: true, title: true, category: true },
    });

    if (!doc) {
      const created = await prisma.document.create({
        data: {
          masterId: activeGame.currentMasterId,
          title: args.title ?? `Character Sheet — ${args.playerId}`,
          content: args.content,
          category: "game_visible",
          type: "character_sheet",
          playerId: args.playerId,
          summary: args.summary ?? null,
        },
      });
      return { id: created.id, title: created.title, created: true };
    }

    const updateData: Record<string, unknown> = { content: args.content };
    if (args.summary !== undefined) updateData.summary = args.summary;
    if (args.title !== undefined) updateData.title = args.title;

    await prisma.document.update({ where: { id: doc.id }, data: updateData });
    return { id: doc.id, title: doc.title, updated: true };
  },
};
