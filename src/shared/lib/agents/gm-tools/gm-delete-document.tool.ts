import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export const gmDeleteDocumentTool = {
  description:
    "Delete a document you own. Allowed for game_hidden (your notes, scene, memory) and game_visible (character sheets, player data). NEVER delete glossary (rules) or brain (your instructions) — that is forbidden. Use sparingly: prefer updating or hiding outdated content over deleting.",
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
      select: { id: true, title: true, category: true },
    });
    if (!doc) throw new Error("errors.documentNotFound");

    if (doc.category === "glossary" || doc.category === "brain") {
      return { success: false, error: "Cannot delete glossary or brain documents — the rules and your instructions are read-only." };
    }

    await prisma.document.delete({ where: { id: doc.id } });
    broadcastGameEvent("document_deleted", { masterId: activeGame.currentMasterId, documentId: doc.id });
    return { deleted: true, title: doc.title, category: doc.category };
  },
};
