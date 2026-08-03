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
    "Read a document from the database by ID. Returns title, category, type, summary, content, AND toc (table of contents: array of {heading, level, offset}). Use toc to navigate — call read_document(id, offset=toc[3].offset, limit=3000) to jump to a specific section without loading the entire document.",

  search_documents:
    "Search across glossary and brain documents. Without query — lists all readable docs. With query — full-text search returns each matching document with a context object containing: heading (closest section heading before the match) and snippet (text around the match). Use read_document(id, offset=X, limit=Y) to jump to a specific section without reading the full document.",

  update_file_summary:
    "Save notes about file processing progress for a specific uploaded file. Use summary to record what was read, key chapters found, where text breaks mid-sentence. Use glossarySummary to record what glossary documents were created/updated from this file and which topics are already covered — helps avoid re-processing the same content.",
} as const;
