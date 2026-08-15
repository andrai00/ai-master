import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { bulkImportToGlossaryAction } from "@/src/shared/actions/builder/bulk-import";

export const bulkImportTool = {
  description: "Bulk import all uploaded files from specified folders into the glossary. Provide a map of folder paths to document types (e.g. { '/classes': 'class', '/spells': 'spell', '/rules': 'rule' }). All files under each folder are created as glossary documents with the assigned type. Titles are built from folder path + filename (without .md). If a glossary document with the same title (same folder path + filename) already exists, it is OVERWRITTEN — you can safely re-import. Use this AFTER explore_archive() and admin confirmation.",
  inputSchema: zodSchema(
    z.object({
      typeMap: z.record(z.string(), z.string()).describe("Map: folder path → document type. Example: { '/classes': 'class', '/spells': 'spell', '/rules': 'rule' }"),
    })
  ),
  execute: async (args: { typeMap: Record<string, string> }) => {
    if (isCancelled()) throw new Error("errors.cancelled");

    const result = await bulkImportToGlossaryAction(args.typeMap);
    if (!result.success) throw new Error(result.error ?? "errors.unknownError");

    return {
      imported: result.imported,
      byType: result.byType,
    };
  },
};
