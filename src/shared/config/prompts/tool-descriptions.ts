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
    "Create a new glossary or brain document. Returns the created document's ID. If a document with the same title already exists, the tool returns the existing document's info — you can then use update_document() to overwrite it or pick a different title.",

  update_document:
    "Update the content, title, or summary of an existing glossary or brain document by ID.",

  read_document:
    "Read a document from the database by ID. Returns title, category, type, summary, and full content.",

  search_documents:
    "Full-text search across glossary and brain documents. Searches title, summary, and content. Returns up to 20 matches.",
} as const;
