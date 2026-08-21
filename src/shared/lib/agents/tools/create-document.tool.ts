import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { assertNotGameMode } from "@/src/shared/lib/db/game-mode-guard";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";
import { assertCanWrite, getWritableCategories } from "./builder-mode-guard";
import { makePath } from "@/src/shared/lib/documents/paths";
import { validateFormulaContent } from "../validate-formulas";
import { validateLinksContent } from "@/src/shared/lib/documents/validate-links";

export const createDocumentTool = {
  description: TOOL_DESCRIPTIONS.create_document,
  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("Document title"),
      content: z.string().describe("Document body in Markdown"),
      category: z.enum(["glossary", "brain", "game_hidden", "game_visible"]).describe("Document category (glossary/brain in brain mode, game_hidden/game_visible in memory mode)"),
      type: z.string().describe("Document type (e.g. rule, template, _index, char_creation, mechanics, routing, char_tracking, game_state, doc_org, note, scene, character_sheet, lore)"),
      path: z.string().optional().describe("Unique document path with category prefix, e.g. 'brain/routing/main-router'. If omitted, derived from the title."),
      tags: z.array(z.string()).optional().describe("Tags for searchability"),
      summary: z.string().optional().describe("1-2 sentence summary for quick preview"),
      playerId: z.string().optional().describe("Player ID for game_visible personal docs. Omit for common/non-player docs."),
    })
  ),
  execute: async (args: {
    title: string;
    content: string;
    category: "glossary" | "brain" | "game_hidden" | "game_visible";
    type: string;
    path?: string;
    tags?: string[];
    summary?: string;
    playerId?: string;
  }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    await assertNotGameMode();
    await assertCanWrite(args.category);

    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noActiveGameTool");

    const prisma = getPrisma();

    const path = makePath(args.category, args.path ?? args.title, args.playerId);

    // Check for existing document with the same title or path
    const writableCategories = await getWritableCategories();
    const existing = await prisma.document.findFirst({
      where: {
        masterId: activeGame.currentMasterId,
        OR: [{ title: args.title }, { path }],
        category: { in: writableCategories },
      },
      select: { id: true, title: true, summary: true, category: true, path: true },
    });

    if (existing) {
      return {
        id: existing.id,
        title: existing.title,
        category: existing.category,
        summary: existing.summary,
        created: false,
        note: `Document with title "${args.title}" (or path "${path}") already exists (id: ${existing.id}). Use update_document() to change it, or choose a different path/title.`,
      };
    }

    const doc = await prisma.document.create({
      data: {
        masterId: activeGame.currentMasterId,
        title: args.title,
        path,
        content: args.content,
        category: args.category,
        type: args.type,
        playerId: args.playerId ?? null,
        tags: JSON.stringify(args.tags ?? []),
        summary: args.summary ?? null,
      },
    });
    broadcastGameEvent("document_created", { masterId: activeGame.currentMasterId, documentId: doc.id });
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      path: doc.path,
      created: true,
      formulaValidation: validateFormulaContent(args.content),
      linkValidation: await validateLinksContent(prisma, activeGame.currentMasterId, args.category, args.content),
    };
  },
};
