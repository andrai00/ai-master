import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

type TRole = "master" | "builder";
type TEvent = "game_message_sent" | "personal_message_sent" | "builder_message_sent";

/**
 * Per-run action ledger: every tool call the agent makes in the current
 * generation is recorded here, so review_draft can show the agent exactly
 * what it has done (and what it has not) before delivering its reply.
 */
const actionLedger = new Map<string, string[]>();

export function clearActions(sessionId: string): void {
  actionLedger.delete(sessionId);
}

export function recordActions(sessionId: string, toolCalls: Array<{ toolName?: string }>): void {
  const list = actionLedger.get(sessionId) ?? [];
  for (const c of toolCalls ?? []) {
    if (c.toolName && c.toolName !== "review_draft" && c.toolName !== "send_reply") {
      list.push(c.toolName);
    }
  }
  actionLedger.set(sessionId, list);
}

function getActions(sessionId: string): string[] {
  return actionLedger.get(sessionId) ?? [];
}

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
 * review_draft — returns the agent's actions this turn plus factual state, so
 * it can verify its draft before delivering. GM chats: assigned rolls,
 * completed-but-unprocessed rolls and recent document changes (notes, sheets,
 * inventory). Builder: recent document activity.
 */
export function makeReviewDraftTool(sessionId: string, kind: "game" | "personal" | "builder") {
  return {
    description:
      "Check your draft before delivering your reply. Returns (1) the actions you have taken THIS turn (tool calls), (2) current state: assigned rolls, completed-but-unprocessed rolls and recent document changes (notes, character sheets, inventory) for GM chats, or recent documents for the Builder. Compare your draft with this list — if you promised a roll, a note, an inventory change or a document, make sure the corresponding action is actually there. If something is missing, do it now, then send_reply.",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const prisma = getPrisma();
      const activeGame = await getActiveGame();
      const masterId = activeGame?.currentMasterId ?? "";

      const out: Record<string, unknown> = {
        actionsThisTurn: getActions(sessionId),
      };

      if (kind === "game" || kind === "personal") {
        const [assigned, completed, recentChanges] = await Promise.all([
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
          prisma.document.findMany({
            where: { masterId, OR: [{ category: "game_hidden" }, { category: "game_visible" }] },
            orderBy: { updatedAt: "desc" },
            take: 10,
            select: { title: true, category: true, updatedAt: true },
          }),
        ]);
        out.assignedRolls = assigned;
        out.completedUnprocessedRolls = completed;
        out.recentChanges = recentChanges;
        return out;
      }

      const docs = await prisma.document.findMany({
        where: { masterId },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { title: true, category: true, type: true, updatedAt: true },
      });
      out.recentDocuments = docs;
      return out;
    },
  };
}

export function didCallSendReply(steps: Array<{ toolCalls?: Array<{ toolName?: string }> }> | undefined): boolean {
  return (steps ?? []).some((s) => (s.toolCalls ?? []).some((tc) => tc.toolName === "send_reply"));
}
