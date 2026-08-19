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
    "Update the content, title, or summary of an existing document by ID. Works on documents in your writable categories (brain mode: glossary/brain, memory mode: game_hidden/game_visible).",

  read_document:
    "Read a document by ID (UUID) or by path/title (e.g. 'spells/207-faerie_fire'). Accepts both formats — auto-detects. In memory mode you can read all categories (glossary, brain, game_hidden, game_visible). Returns computed formula values when the document contains ```formula blocks.",

  roll_dice:
    "Roll dice using standard RPG notation. Full syntax supports: basic (4d6, 1d20), modifier (1d20+5), keep/drop (4d6kh3, 4d6dl1), reroll (4d6ro<2), exploding (4d6!), compound (2d20+1d6), grouped ([[4d6dl1]][[4d6dl1]]). Returns total and detailed output.",

  present_roll_check:
    "Assign dice rolls to specific player(s). Each player sees ONE clickable button per check. Use count>1 for multiple identical rolls — all rolled from that single button.",

  validate_links:
    "Validate all /doc/ID links in glossary documents. Returns a list of broken links: source document, target ID that doesn't exist, and display text. Use this after import to verify index integrity, or when the admin asks to check links.",
} as const;
