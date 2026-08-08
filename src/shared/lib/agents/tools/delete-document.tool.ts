import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { assertNotGameMode } from "@/src/shared/lib/db/game-mode-guard";
import { assertCanWrite } from "./builder-mode-guard";
import { resolveDocId } from "./resolve-doc-id";

export const deleteDocumentTool = {
  description: "Delete a glossary or brain document by ID. ONLY use this when the admin explicitly asks you to delete a specific document. Never delete documents on your own initiative.",
  inputSchema: zodSchema(
    z.object({
      docId: z.string().describe("Document ID (UUID) or path (e.g. 'spells/207-faerie_fire'). Auto-resolves."),
    })
  ),
  execute: async (args: { docId: string }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    await assertNotGameMode();

    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId;
    if (!masterId) throw new Error("errors.noActiveGameTool");

    const prisma = getPrisma();

    const resolvedId = await resolveDocId(args.docId);
    if (!resolvedId) throw new Error("errors.unknownDocId");

    const doc = await prisma.document.findUnique({
      where: { id: resolvedId },
      select: { id: true, title: true, category: true },
    });
    if (!doc) throw new Error("errors.unknownDocId");

    await assertCanWrite(doc.category);

    await prisma.document.delete({ where: { id: resolvedId } });

    return { deleted: true, title: doc.title, category: doc.category };
  },
};
