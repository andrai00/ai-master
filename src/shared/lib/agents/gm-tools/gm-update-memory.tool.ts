import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

const MEMORY_TITLE = "Game Memory";
const MEMORY_TYPE = "game_memory";

interface IMemoryEntry {
  id: string;
  category: string;
  text: string;
  updatedAt: string;
}

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * update_memory — the GM's own structured game memory (game_hidden).
 * One "Game Memory" document per master holds facts, secrets and plans.
 * Categories and structure come from the game's brain docs.
 */
export const gmUpdateMemoryTool = {
  description:
    "Maintain YOUR hidden game memory (a 'Game Memory' document in game_hidden). Use it to record important facts, secrets, plans and notes so you never forget them. Actions: add (new entry), update (edit an existing entry by id), remove (delete an obsolete entry). To review your memory, read the 'Game Memory' document (get_gm_notes / read_document). Record important information right away — do not rely on the chat window.",
  inputSchema: zodSchema(
    z.object({
      action: z.enum(["add", "update", "remove"]).describe("What to do with the memory entry"),
      category: z
        .string()
        .optional()
        .describe("Entry category (e.g. fact, secret, plan, npc, rumor). Use the categories your brain defines for this game."),
      text: z.string().optional().describe("The content of the entry (required for add and update)"),
      id: z.string().optional().describe("Entry id (required for update and remove)"),
    })
  ),
  execute: async (args: { action: "add" | "update" | "remove"; category?: string; text?: string; id?: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const masterId = activeGame.currentMasterId;

    const doc = await prisma.document.findFirst({
      where: { masterId, category: "game_hidden", type: MEMORY_TYPE, status: "active" },
      select: { id: true, content: true },
    });

    let entries: IMemoryEntry[] = [];
    if (doc?.content) {
      try {
        const parsed = JSON.parse(doc.content);
        entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      } catch {
        entries = [];
      }
    }

    const now = new Date().toISOString();

    if (args.action === "add") {
      if (!args.category || !args.text?.trim()) {
        return { success: false, error: "category and text are required for add" };
      }
      entries.push({ id: generateId(), category: args.category, text: args.text.trim(), updatedAt: now });
    } else if (args.action === "update") {
      const entry = entries.find((e) => e.id === args.id);
      if (!entry) return { success: false, error: "entry not found" };
      if (args.category !== undefined && args.category.trim()) entry.category = args.category.trim();
      if (args.text !== undefined && args.text.trim()) entry.text = args.text.trim();
      entry.updatedAt = now;
    } else if (args.action === "remove") {
      entries = entries.filter((e) => e.id !== args.id);
    }

    const content = JSON.stringify({ entries }, null, 2);

    if (doc) {
      await prisma.document.update({ where: { id: doc.id }, data: { content } });
    } else {
      await prisma.document.create({
        data: {
          masterId,
          title: MEMORY_TITLE,
          type: MEMORY_TYPE,
          category: "game_hidden",
          content,
          summary: "GM's own game memory: facts, secrets, plans.",
          tags: "[]",
        },
      });
    }

    return { success: true, memoryCount: entries.length };
  },
};
