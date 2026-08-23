import { z } from "zod";
import { zodSchema } from "ai";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { buildTurnDigest } from "../turn-digest";
import { markReviewDone, getPlannedFacts, getActions } from "../reply-tools";

// Write tools that record facts into the master's memory (game_hidden / scene).
// If the plan declared new_facts, at least one of these MUST have been called.
const MEMORY_WRITE_TOOLS = new Set([
  "write_note",
  "create_document",
  "update_document",
  "set_scene_state",
  "update_char_sheet",
  "rename_document",
  "delete_document",
]);

/**
 * review_turn — the last tool before the FINAL reply of a run that changed
 * state. Recomputes the state digest and returns what is still missing:
 * unconsumed completed rolls, stale memory index, docs changed after reading,
 * and new facts that plan_turn declared but were never written to memory.
 * The model fixes the listed items and calls review_turn again until ok:true,
 * only then writes the final reply.
 */
export function createReviewTurnTool(sessionId: string) {
  return {
    description:
      "REVIEW before your final reply. Call it AFTER you changed state (writes/rolls) and BEFORE writing the final answer. It checks the state you leave behind (unconfirmed rolls, stale memory index, changed docs, and new facts you declared in plan_turn but never wrote to memory) and returns a checklist of what is still missing. Fix every item it lists (call review_turn again until ok:true), then write the final reply.",
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

      // Completeness: facts declared in plan_turn must have been recorded this
      // turn. The player's notebook is fiction — the master's memory is the
      // game state. If a fact was declared but no memory write happened, the
      // final reply would leak it only into chat (lost on summarization).
      const planned = getPlannedFacts(sessionId);
      if (planned.length > 0) {
        const used = getActions(sessionId).some((t) => MEMORY_WRITE_TOOLS.has(t));
        if (!used) {
          pending.push(
            `В plan_turn ты объявил новые факты, но не записал их в память (game_hidden): ${planned.join("; ")}. Создай/обнови карточку или сцену (write_note / create_document / update_document / set_scene_state), а потом обнови индекс памяти.`
          );
        }
      }

      return { ok: pending.length === 0, pending, note: args.note ?? null };
    },
  };
}
