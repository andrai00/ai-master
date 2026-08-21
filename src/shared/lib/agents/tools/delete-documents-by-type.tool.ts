import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { assertNotGameMode } from "@/src/shared/lib/db/game-mode-guard";

export const deleteDocumentsByTypeTool = {
  description:
    "Delete ALL glossary documents of a given type (e.g. 'article', 'lore') in one operation. TWO-STEP: first call WITHOUT confirm to see the count (dry run), then call again with confirm: true ONLY after the admin approved the count. Never delete brain/game_hidden/game_visible. Never delete a type the admin did not explicitly approve.",
  inputSchema: zodSchema(
    z.object({
      type: z.string().describe("Document type to delete, e.g. 'article'"),
      confirm: z.boolean().optional().describe("Omit or false = dry run (returns count). true = actually delete."),
    })
  ),
  execute: async (args: { type: string; confirm?: boolean }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    await assertNotGameMode();

    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId;
    if (!masterId) throw new Error("errors.noActiveGameTool");

    const prisma = getPrisma();

    const count = await prisma.document.count({
      where: { masterId, category: "glossary", type: args.type },
    });

    if (args.confirm !== true) {
      return {
        type: args.type,
        wouldDelete: count,
        confirmRequired: true,
        note: `This will permanently delete ${count} glossary documents of type "${args.type}". Ask the admin to confirm, then call again with confirm: true.`,
      };
    }

    const result = await prisma.document.deleteMany({
      where: { masterId, category: "glossary", type: args.type },
    });

    if (result.count > 0) {
      broadcastGameEvent("document_deleted", { masterId });
    }

    return { deleted: result.count, type: args.type };
  },
};
