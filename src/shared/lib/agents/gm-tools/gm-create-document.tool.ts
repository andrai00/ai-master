import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export const gmCreateDocumentTool = {
  description: "Create a new document. Can create game_hidden (notes, plans) and game_visible (character sheets, public info).",
  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("Document title"),
      content: z.string().describe("Document body in Markdown"),
      category: z.enum(["game_hidden", "game_visible"]).describe("Document category"),
      type: z.string().describe("Document type (e.g. note, character_sheet, scene, template)"),
      playerId: z.string().optional().describe("Player ID for game_visible personal docs. Omit for common docs."),
      summary: z.string().optional().describe("1-2 sentence summary"),
      tags: z.array(z.string()).optional().describe("Tags for searchability"),
    })
  ),
  execute: async (args: {
    title: string;
    content: string;
    category: "game_hidden" | "game_visible";
    type: string;
    playerId?: string;
    summary?: string;
    tags?: string[];
  }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    const prisma = getPrisma();

    const existing = await prisma.document.findFirst({
      where: {
        masterId: activeGame.currentMasterId,
        title: args.title,
        category: args.category,
        playerId: args.playerId ?? null,
      },
      select: { id: true, title: true },
    });

    if (existing) {
      return {
        id: existing.id,
        title: existing.title,
        created: false,
        note: `Document "${args.title}" already exists (id: ${existing.id}). Use update_document to modify it.`,
      };
    }

    const doc = await prisma.document.create({
      data: {
        masterId: activeGame.currentMasterId,
        title: args.title,
        content: args.content,
        category: args.category,
        type: args.type,
        playerId: args.playerId ?? null,
        summary: args.summary ?? null,
        tags: JSON.stringify(args.tags ?? []),
      },
    });
    broadcastGameEvent("document_created", { masterId: activeGame.currentMasterId, documentId: doc.id });
    return { id: doc.id, title: doc.title, created: true };
  },
};
