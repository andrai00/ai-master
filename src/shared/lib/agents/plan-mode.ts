import type { ToolSet } from "ai";
import { gmSearchRulesTool } from "./gm-tools/gm-search-rules.tool";
import { gmGlossaryOverviewTool } from "./gm-tools/gm-glossary-overview.tool";
import { gmGetBrainTool } from "./gm-tools/gm-get-brain.tool";
import { gmGetGmNotesTool } from "./gm-tools/gm-get-gm-notes.tool";
import { gmGetSceneStateTool } from "./gm-tools/gm-get-scene-state.tool";
import { gmGetPlayerSheetTool } from "./gm-tools/gm-get-player-sheet.tool";
import { gmGetPlayersTool } from "./gm-tools/gm-get-players.tool";
import { gmResolveGlossaryLinkTool } from "./gm-tools/gm-resolve-glossary-link.tool";
import { gmGetRollsTool, gmPersonalGetRollsTool } from "./gm-tools/gm-get-rolls.tool";
import { getChatSummaryTool } from "./gm-tools/gm-chat-summary.tool";
import { readDocumentTool } from "./tools/read-document.tool";
import { listAllDocumentsTool } from "./tools/list-all-documents.tool";
import { getBuilderGuideTool } from "./tools/get-builder-guide.tool";
import { listUploadedFilesTool } from "./tools/list-uploaded-files.tool";
import { exploreArchiveTool } from "./tools/explore-archive.tool";
import { readFileTool } from "./tools/read-file.tool";

// Plan Mode (like Cursor/Kilo Plan mode): the agent researches with READ-only
// tools and returns a plan. Nothing is written, nothing is rolled.
export const PLAN_MODE_SYSTEM = `## PLAN MODE
You are in PLAN MODE: research and produce a plan. DO NOT create, update, delete any documents. DO NOT roll dice, write notes, change scene state, or import files. Only READ and SEARCH.

Use the read/search tools to explore what is needed (rules, brain, notes, players, uploaded files). Then write a concise plan as your final reply:
- What you will do, step by step
- Which documents/notes you will create or update (with types/categories)
- Which rules or mechanics apply
- Anything you need from the user first

Keep the plan short and actionable. The plan is visible to the user before execution.`;

export function getPlanTools(chat: "builder" | "game" | "personal"): ToolSet {
  const base = {
    search_rules: gmSearchRulesTool,
    glossary_overview: gmGlossaryOverviewTool,
    get_brain: gmGetBrainTool,
    get_gm_notes: gmGetGmNotesTool,
    get_player_sheet: gmGetPlayerSheetTool,
    read_document: readDocumentTool,
    list_all_documents: listAllDocumentsTool,
    get_chat_summary: getChatSummaryTool,
    resolve_glossary_link: gmResolveGlossaryLinkTool,
  };

  if (chat === "builder") {
    return {
      ...base,
      get_builder_guide: getBuilderGuideTool,
      get_scene_state: gmGetSceneStateTool,
      get_players: gmGetPlayersTool,
      list_uploaded_files: listUploadedFilesTool,
      explore_archive: exploreArchiveTool,
      read_file: readFileTool,
    };
  }

  if (chat === "personal") {
    return {
      ...base,
      get_rolls: gmPersonalGetRollsTool,
    };
  }

  return {
    ...base,
    get_scene_state: gmGetSceneStateTool,
    get_players: gmGetPlayersTool,
    get_rolls: gmGetRollsTool,
  };
}
