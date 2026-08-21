import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { assertNotGameMode } from "@/src/shared/lib/db/game-mode-guard";

export const deleteDocumentsByTypeTool = {
  description:
    "Delete ALL glossary documents of a given type (e.g. 'article', 'lore') in ONE operation. ONLY use when the admin explicitly asks to remove a whole type. Never delete brain/game_hidden/game_visible documents. Never delete types the admin did not ask to remove.",
  inputSchema: zodSchema(
    z.object({
      type: z.string().describe("Document type to delete, e.g. 'article'"),
    })
  ),
  execute: async (args: { type: string }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    await assertNotGameMode();

    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId;
    if (!masterId) throw new Error("errors.noActiveGameTool");

    const prisma = getPrisma();

    const result = await prisma.document.deleteMany({
      where: { masterId, category: "glossary", type: args.type },
    });

    if (result.count > 0) {
      broadcastGameEvent("document_deleted", { masterId });
    }

    return { deleted: result.count, type: args.type };
  },
};
