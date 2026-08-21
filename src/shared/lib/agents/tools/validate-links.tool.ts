import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { resolveDocId } from "./resolve-doc-id";
import { validateLinksContent } from "@/src/shared/lib/documents/validate-links";

export const validateLinksTool = {
  description:
    "Check every internal link of a document: each link must resolve to an existing document, its category must be allowed from the document's category (glossary→glossary; brain→brain+glossary; hidden→glossary+hidden+visible; visible→glossary), and a #anchor must match a heading of the target document. Returns the link count and per-link errors. Use it on existing documents (or your draft content) to find broken links, disallowed categories, or bad anchors before/after editing.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID), path or title"),
    })
  ),
  execute: async (args: { id: string }) => {
    if (isCancelled()) throw new Error("errors.cancelled");

    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const resolvedId = await resolveDocId(args.id);
    if (!resolvedId) throw new Error("errors.documentNotFound");

    const doc = await prisma.document.findUnique({
      where: { id: resolvedId },
      select: { id: true, title: true, category: true, content: true },
    });
    if (!doc) throw new Error("errors.documentNotFound");

    const validation = await validateLinksContent(prisma, activeGame.currentMasterId, doc.category, doc.content);
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      linkValidation:
        validation ?? { ok: true, linkCount: 0, errorCount: 0, errors: {} },
    };
  },
};
