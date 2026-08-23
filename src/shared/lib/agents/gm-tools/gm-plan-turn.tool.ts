import { z } from "zod";
import { zodSchema } from "ai";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { buildTurnDigest, formatTurnDigest } from "../turn-digest";
import { markPlanDone, setPlannedFacts } from "../reply-tools";

/**
 * plan_turn — the first tool of every GM run that is going to change state.
 * The model declares what it sees (triggers from the brain index), what it
 * will read, write and roll. The tool marks the run as "planned" (the gate
 * that unlocks write/roll tools) and returns the fresh state digest so the
 * model plans FROM the index + memory, not from memory.
 */
export function createPlanTurnTool(sessionId: string) {
  return {
    description:
      "PLAN this turn. MANDATORY before ANY write/roll tool (create/update/delete document, write_note, set_scene_state, update_char_sheet, present_roll_check, confirm_rolls, roll_dice). Declare what happened (triggers from the brain index that apply), what you will read, what you will write, what you will roll, and which NEW facts this turn's narration will reveal. Returns the current state digest (changed docs, scene, memory index, pending rolls) — plan your actions from it. Call it FIRST, before acting.",
    inputSchema: zodSchema(
      z.object({
        intent: z
          .string()
          .describe("Short summary of this turn: what happened / what the player asked / what you will do."),
        triggers: z
          .array(z.string())
          .describe("Brain-index triggers that apply THIS turn (from the preloaded trigger table), e.g. 'атака/крит', 'проверка навыка', 'ресурс потрачен', 'сцена завершилась', 'новый НИП/секрет'. Empty if none apply."),
        reads: z.array(z.string()).describe("Documents/sections you plan to READ this turn (paths or titles)."),
        writes: z.array(z.string()).describe("Documents you plan to CREATE/UPDATE/DELETE this turn (paths or titles). Empty if you will not write."),
        rolls: z.array(z.string()).describe("Rolls you plan to ASSIGN or CONFIRM this turn (short names). Empty if none."),
        new_facts: z
          .array(z.string())
          .describe("NEW facts this turn's narration will reveal that MUST be recorded in your memory (game_hidden) this turn: named NPCs (e.g. 'магистр Роук'), schedules, items, security measures, secrets, location details, clues. The player's notebook is NOT your memory — you must record these facts yourself. Empty if no new facts."),
      })
    ),
    execute: async (args: {
      intent: string;
      triggers: string[];
      reads: string[];
      writes: string[];
      rolls: string[];
      new_facts: string[];
    }) => {
      const activeGame = await getActiveGame();
      if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

      markPlanDone(sessionId);
      setPlannedFacts(sessionId, args.new_facts ?? []);

      const digest = await buildTurnDigest(sessionId, activeGame.currentMasterId);

      const stateBlock = formatTurnDigest(digest);

      return {
        ok: true,
        intent: args.intent,
        triggers: args.triggers,
        planned_reads: args.reads,
        planned_writes: args.writes,
        planned_rolls: args.rolls,
        planned_new_facts: args.new_facts ?? [],
        state: stateBlock.trim(),
      };
    },
  };
}
