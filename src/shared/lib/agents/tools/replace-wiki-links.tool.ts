import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { replaceAllLinks } from "./wiki-links-lib";

export const replaceWikiLinksTool = {
  description: "Replace all matched links in glossary documents with [[document-id]] references. Handles both [[wiki-links]] (match by title) and [text](/path) markdown links (match last path segment against document titles). Call scan_wiki_links first to preview what will change.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    if (isCancelled()) throw new Error("errors.cancelled");

    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId;
    if (!masterId) throw new Error("errors.noActiveGameTool");

    const prisma = getPrisma();

    const docs = await prisma.document.findMany({
      where: { masterId, category: "glossary", status: "active" },
      select: { id: true, title: true, content: true },
    });

    const titleToId = new Map<string, string>();
    for (const d of docs) {
      titleToId.set(d.title.toLowerCase(), d.id);
    }

    let totalReplaced = 0;
    let updatedDocs = 0;

    for (const doc of docs) {
      const { content, replaced } = replaceAllLinks(doc.content, titleToId);
      if (replaced > 0) {
        await prisma.document.update({
          where: { id: doc.id },
          data: { content },
        });
        totalReplaced += replaced;
        updatedDocs++;
      }
    }

    return {
      replaced: totalReplaced,
      updatedDocuments: updatedDocs,
    };
  },
};
