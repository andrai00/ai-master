import { z } from "zod";
import { zodSchema } from "@ai-sdk/provider-utils";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { assertNotGameMode } from "@/src/shared/lib/db/game-mode-guard";
import { throwIfCancelled } from "@/src/shared/lib/agents/parse-cancel";

export const createDocumentTool = {
  description: "Create a new document in the database (glossary or brain category only). Returns the created document's ID.",
  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("Document title"),
      content: z.string().describe("Document body in Markdown"),
      category: z.enum(["glossary", "brain"]).describe("Document category"),
      type: z.string().describe("Document type (e.g. rule, template, _index, char_creation, mechanics, routing)"),
      tags: z.array(z.string()).optional().describe("Tags for searchability"),
      summary: z.string().optional().describe("1-2 sentence summary for quick preview"),
    })
  ),
  execute: async (args: {
    title: string;
    content: string;
    category: "glossary" | "brain";
    type: string;
    tags?: string[];
    summary?: string;
  }) => {
    throwIfCancelled();
    await assertNotGameMode();
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noActiveGameTool");

    const prisma = getPrisma();
    const doc = await prisma.document.create({
      data: {
        masterId: activeGame.currentMasterId,
        title: args.title,
        content: args.content,
        category: args.category,
        type: args.type,
        tags: JSON.stringify(args.tags ?? []),
        summary: args.summary ?? null,
      },
    });
    return { id: doc.id, title: doc.title, category: doc.category };
  },
};
