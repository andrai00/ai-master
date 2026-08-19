import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const getChatSummaryTool = {
  description: "Read the current chat history summary for this game. Contains condensed version of older conversations.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");
    const prisma = getPrisma();
    const summary = await prisma.chatSummary.findFirst({
      where: { masterId: activeGame.currentMasterId },
      select: { content: true, preview: true },
    });
    return summary
      ? { ...summary, source: "chat_summary" }
      : { content: "", preview: "", source: "chat_summary" };
  },
};

export const updateChatSummaryTool = {
  description: "Update the chat history summary. Write a compact summary of recent events, decisions, and outcomes. The old summary will be replaced.",
  inputSchema: zodSchema(
    z.object({
      content: z.string().describe("Updated summary in Markdown. Include key events, decisions, player actions, and outcomes."),
      preview: z.string().optional().describe("Short 1-line preview for the context header"),
    })
  ),
  execute: async (args: { content: string; preview?: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");
    const prisma = getPrisma();

    const existing = await prisma.chatSummary.findFirst({
      where: { masterId: activeGame.currentMasterId },
      select: { id: true },
    });

    if (existing) {
      await prisma.chatSummary.update({
        where: { id: existing.id },
        data: { content: args.content, preview: args.preview ?? "" },
      });
    } else {
      await prisma.chatSummary.create({
        data: { masterId: activeGame.currentMasterId, content: args.content, preview: args.preview ?? "" },
      });
    }
    return { updated: true };
  },
};
