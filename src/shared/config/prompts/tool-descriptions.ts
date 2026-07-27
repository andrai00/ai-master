/**
 * LLM-facing tool descriptions.
 * Keep these separate from tool implementation code.
 * Update descriptions here — they propagate to all tools.
 */

export const TOOL_DESCRIPTIONS = {
  read_parsed_file:
    "Read a chunk of a previously uploaded and parsed file. Default reads first 5000 characters. Use offset and limit to paginate.",

  list_uploaded_files:
    "List all uploaded files currently in the cache (fileId, filename, size).",

  create_document:
    "Create a new glossary or brain document. One document = one topic — never merge distinct topics into one document. Use type to categorise: rule, template, _index, char_creation, mechanics, routing, char_tracking, game_state, doc_org. Include Markdown templates for the AI Master to copy during play. Returns the created document's ID. If a document with the same title already exists, the tool returns the existing document's info — you can then use update_document() to overwrite it or pick a different title.",

  update_document:
    "Update the content, title, or summary of an existing glossary or brain document by ID.",

  read_document:
    "Read a document from the database by ID. Returns title, category, type, summary, and full content.",

  search_documents:
    "Full-text search across glossary and brain documents. Searches title, summary, and content. Returns up to 20 matches.",

  update_file_summary:
    "Save notes about file processing progress for a specific uploaded file. Use summary to record what was read, key chapters found, where text breaks mid-sentence. Use glossarySummary to record what glossary documents were created/updated from this file and which topics are already covered — helps avoid re-processing the same content.",
} as const;
