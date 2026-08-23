import { z } from "zod";
import { zodSchema } from "ai";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { buildTurnDigest } from "../turn-digest";
import { markReviewDone } from "../reply-tools";

/**
 * review_turn — the last tool before the FINAL reply of a run that changed
 * state. Recomputes the state digest and returns what is still missing:
 * unconsumed completed rolls, stale memory index, docs changed after reading.
 * The model fixes the listed items and calls review_turn again until ok:true,
 * only then writes the final reply.
 */
export function createReviewTurnTool(sessionId: string) {
  return {
    description:
      "REVIEW before your final reply. Call it AFTER you changed state (writes/rolls) and BEFORE writing the final answer. It checks the state you leave behind (unconfirmed rolls, stale memory index, changed docs) and returns a checklist of what is still missing. Fix every item it lists (call review_turn again until ok:true), then write the final reply.",
    inputSchema: zodSchema(
      z.object({
        note: z
          .string()
          .optional()
          .describe("Optional one-line summary of what you changed this turn (for your own record)."),
      })
    ),
    execute: async (args: { note?: string }) => {
      const activeGame = await getActiveGame();
      if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

      markReviewDone(sessionId);

      const digest = await buildTurnDigest(sessionId, activeGame.currentMasterId);
      const pending: string[] = [];

      if (digest.completedRolls > 0) {
        pending.push(
          `Завершённых бросков не подтверждено: ${digest.completedRolls}. Используй результаты в ответе и вызови confirm_rolls (важные сохрани в game_hidden заранее).`
        );
      }
      if (digest.memoryIndex?.stale) {
        pending.push(`Индекс памяти «${digest.memoryIndex.title}» устарел — обнови его после правок памяти.`);
      }
      for (const d of digest.staleDocs) {
        pending.push(`Документ «${d.title}» изменился после чтения — перечитай его, прежде чем опираться на него.`);
      }
      if (digest.scene?.stale) {
        pending.push(`Сцена «${digest.scene.title}» изменилась после чтения — перечитай её.`);
      }

      return { ok: pending.length === 0, pending, note: args.note ?? null };
    },
  };
}
