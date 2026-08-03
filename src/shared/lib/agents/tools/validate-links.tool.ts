import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";

const LINK_RE = /\[\s*([^\]]*?)\s*\]\(\/doc\/([a-zA-Z0-9-]+)\)/g;

interface IBrokenLink {
  sourceDocId: string;
  sourceTitle: string;
  targetDocId: string;
  displayText: string;
}

export const validateLinksTool = {
  description: TOOL_DESCRIPTIONS.validate_links,
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    if (isCancelled()) throw new Error("errors.cancelled");
    const activeGame = await getActiveGame();
    if (!activeGame) return [];

    const prisma = getPrisma();

    const docs = await prisma.document.findMany({
      where: {
        masterId: activeGame.currentMasterId,
        category: "glossary",
      },
      select: { id: true, title: true, content: true },
    });

    if (docs.length === 0) return [];

    const allIds = new Set(docs.map((d) => d.id));
    const broken: IBrokenLink[] = [];

    for (const doc of docs) {
      let match: RegExpExecArray | null;
      LINK_RE.lastIndex = 0;
      while ((match = LINK_RE.exec(doc.content)) !== null) {
        const displayText = match[1]?.trim() ?? "";
        const targetId = match[2]!;
        if (!allIds.has(targetId)) {
          broken.push({
            sourceDocId: doc.id,
            sourceTitle: doc.title,
            targetDocId: targetId,
            displayText,
          });
        }
      }
    }

    return broken;
  },
};
