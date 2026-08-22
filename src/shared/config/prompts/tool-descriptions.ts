/**
 * LLM-facing tool descriptions.
 * Keep these separate from tool implementation code.
 * Update descriptions here — they propagate to all tools.
 */

export const TOOL_DESCRIPTIONS = {
  list_uploaded_files:
    "List all uploaded files for the current game (fileId, filename, path, size). Use before explore_archive to get an overview.",

  explore_archive:
    "Show the directory structure of uploaded files: a flat 'folders' list (every folder with its full path and direct file count) plus a hierarchical tree with sample filenames. Decide a document type for EACH folder by the MEANING of its contents — deeper folders override their parent (e.g. rules/bestiary/ is not rules, it is the bestiary). Use this before bulk_import_to_glossary.",

  create_document:
    "Create a new document. Valid categories depend on your mode: brain mode → glossary/brain, memory mode → game_hidden/game_visible. One document = one topic — never merge distinct topics into one. Use type to categorise: rule, template, _index, char_creation, mechanics, routing, char_tracking, game_state, doc_org, note, scene, character_sheet, lore. For game_visible with per-player data, provide playerId. Returns the created document's ID. If a document with the same title already exists, the tool returns the existing document's info — you can then use update_document() to overwrite it or pick a different title.",

  update_document:
    "Update the content, title, or summary of an existing document by ID. Works on documents in your writable categories (brain mode: glossary/brain, memory mode: game_hidden/game_visible). For a SMALL change — a few lines — pass edits: [{ start_line, end_line, new_lines }] using absolute 1-based line numbers from a numbered read (read_document with numbered: true); the edit replaces ONLY those lines (end_line = start_line - 1 inserts, empty new_lines deletes). Do NOT rewrite the whole content for a small change. Use content only for wholesale rewrites.",

  read_document:
    "Read a document by ID (UUID), path, title, or directly by a link target copied from a [[...]] wiki-link (e.g. 'races/217-plasmoid', 'glossary/races/217-plasmoid', 'Бой D&D 5e'). All forms auto-resolve. In memory mode you can read all categories (glossary, brain, game_hidden, game_visible). Returns computed formula values when the document contains ```formula blocks. For LONG documents, prefer reading only the section you need: first toc_only: true to see the structure, then anchor: '<exact heading text from toc>' to get ONLY that section (mode:'section' + hasMore, not the whole document); read the whole document only when the section is not enough. To EDIT specific lines, pass numbered: true — the document is returned as absolute 1-based numbered lines (page with start_line/line_limit), which you then target in update_document edits.",

  roll_dice:
    "Roll dice using standard RPG notation. Full syntax supports: basic (4d6, 1d20), modifier (1d20+5), keep/drop (4d6kh3, 4d6dl1), reroll (4d6ro<2), exploding (4d6!), compound (2d20+1d6), grouped ([[4d6dl1]][[4d6dl1]]). Returns total and detailed output.",

  present_roll_check:
    "Assign dice rolls to specific player(s). Each player sees ONE clickable button per check. Use count>1 for multiple identical rolls — all rolled from that single button.",
} as const;
