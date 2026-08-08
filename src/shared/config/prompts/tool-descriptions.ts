/**
 * LLM-facing tool descriptions.
 * Keep these separate from tool implementation code.
 * Update descriptions here — they propagate to all tools.
 */

export const TOOL_DESCRIPTIONS = {
  list_uploaded_files:
    "List all uploaded files for the current game (fileId, filename, path, size). Use before explore_archive to get an overview.",

  explore_archive:
    "Show the directory tree of uploaded files — folder hierarchy with file counts and sample filenames. Use this to understand the structure before deciding document types for import.",

  create_document:
    "Create a new document. Valid categories depend on your mode: brain mode → glossary/brain, memory mode → game_hidden/game_visible. One document = one topic — never merge distinct topics into one. Use type to categorise: rule, template, _index, char_creation, mechanics, routing, char_tracking, game_state, doc_org, note, scene, character_sheet, lore. For game_visible with per-player data, provide playerId. Returns the created document's ID. If a document with the same title already exists, the tool returns the existing document's info — you can then use update_document() to overwrite it or pick a different title.",

  update_document:
    "Update the content, title, or summary of an existing document by ID. Works on documents in your writable categories (brain mode: glossary/brain, memory mode: game_hidden/game_visible).",

  read_document:
    "Read a document by ID (UUID) or by path/title (e.g. 'spells/207-faerie_fire'). Accepts both formats — auto-detects. In memory mode you can read all categories (glossary, brain, game_hidden, game_visible).",

  search_documents:
    "Search across all document categories you can read. Without query — lists all readable docs. With query — full-text search returns each matching document. In memory mode searches glossary, brain, game_hidden, and game_visible. Use read_document(id, offset=X, limit=Y) to jump to a specific section.",

  validate_links:
    "Validate all /doc/ID links in glossary documents. Returns a list of broken links: source document, target ID that doesn't exist, and display text. Use this after import to verify index integrity, or when the admin asks to check links.",
} as const;
