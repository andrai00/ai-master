import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export const gmUpdateDocumentTool = {
  description: "Update an existing document. Can update game_hidden and game_visible documents only.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID)"),
      content: z.string().describe("New document body in Markdown"),
      title: z.string().optional().describe("New title (optional)"),
      summary: z.string().optional().describe("New summary (optional)"),
    })
  ),
  execute: async (args: { id: string; content: string; title?: string; summary?: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    const prisma = getPrisma();
    const existing = await prisma.document.findFirst({
      where: { id: args.id, masterId: activeGame.currentMasterId },
      select: { id: true, category: true },
    });
    if (!existing) throw new Error("errors.documentNotFound");
    if (existing.category === "glossary" || existing.category === "brain") {
      throw new Error("errors.cannotWriteInMode: glossary and brain are read-only in game mode");
    }

    const updateData: Record<string, unknown> = { content: args.content };
    if (args.title !== undefined) updateData.title = args.title;
    if (args.summary !== undefined) updateData.summary = args.summary;

    await prisma.document.update({ where: { id: args.id }, data: updateData });
    broadcastGameEvent("document_updated", { masterId: activeGame.currentMasterId, documentId: args.id });
    return { id: args.id, updated: true };
  },
};
