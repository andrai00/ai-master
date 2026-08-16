import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

type TRole = "master" | "builder";
type TEvent = "game_message_sent" | "personal_message_sent" | "builder_message_sent";

/**
 * send_reply — the agent delivers its answer through this tool instead of
 * "just finishing" the generation. This gives a natural enforcement point:
 * the runner knows when a reply was actually sent, and the prompt can
 * require calling review_draft before it.
 */
export function makeSendReplyTool(sessionId: string, role: TRole, event: TEvent) {
  return {
    description:
      "Deliver your final reply to the chat. Your answer is ONLY sent when you call this tool — call it with the full text of your response. Before calling it, use review_draft to make sure your reply is complete.",
    inputSchema: zodSchema(
      z.object({
        text: z.string().describe("The full text of your reply — this is exactly what the player/admin will see."),
      })
    ),
    execute: async (args: { text: string }) => {
      const content = args.text.trim();
      if (!content) return { success: false, error: "empty" };

      const prisma = getPrisma();
      await prisma.message.create({
        data: {
          sessionId,
          senderId: (await getSession())?.userId ?? "",
          role,
          content,
        },
      });
      broadcastGameEvent(event, { sessionId });
      return { success: true, sent: true };
    },
  };
}

/**
 * review_draft — returns factual state so the agent can verify its draft
 * before delivering. GM chats: pending assigned rolls and completed-but-
 * unprocessed rolls. Builder: recent document activity.
 */
export function makeReviewDraftTool(sessionId: string, kind: "game" | "personal" | "builder") {
  return {
    description:
      "Check the current draft state before delivering your reply. Returns the pending/assigned rolls and completed-but-unprocessed rolls (GM chats), or recent document activity (Builder). Use it to verify your draft is complete — e.g. any roll you ask a player to make must already be assigned via present_roll_check.",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const prisma = getPrisma();
      const activeGame = await getActiveGame();
      const masterId = activeGame?.currentMasterId ?? "";

      if (kind === "game" || kind === "personal") {
        const [assigned, completed] = await Promise.all([
          prisma.roll.findMany({
            where: { sessionId, status: "assigned" },
            select: { checkName: true, diceExpression: true, playerId: true },
            orderBy: { createdAt: "asc" },
            take: 20,
          }),
          prisma.roll.findMany({
            where: { sessionId, status: "completed", consumed: false },
            select: { checkName: true, result: true, playerId: true },
            orderBy: { completedAt: "asc" },
            take: 10,
          }),
        ]);
        return { assignedRolls: assigned, completedUnprocessedRolls: completed };
      }

      const docs = await prisma.document.findMany({
        where: { masterId },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { title: true, category: true, type: true, updatedAt: true },
      });
      return { recentDocuments: docs };
    },
  };
}

export function didCallSendReply(steps: Array<{ toolCalls?: Array<{ toolName?: string }> }> | undefined): boolean {
  return (steps ?? []).some((s) => (s.toolCalls ?? []).some((tc) => tc.toolName === "send_reply"));
}
