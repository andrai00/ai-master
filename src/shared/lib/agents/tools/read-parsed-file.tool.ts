import { z } from "zod";
import { zodSchema } from "ai";
import { getCachedFile, getFileParseError } from "@/src/shared/lib/agents/file-cache";
import { throwIfCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";

export const readParsedFileTool = {
  description: TOOL_DESCRIPTIONS.read_parsed_file,
  inputSchema: zodSchema(
    z.object({
      fileId: z.string().describe("File ID from upload"),
      offset: z.number().optional().describe("Character offset (default 0)"),
      limit: z.number().optional().describe("Max characters (default 5000)"),
    })
  ),
  execute: async (args: { fileId: string; offset?: number; limit?: number }) => {
    const { fileId } = args;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 5000;

    // Check if parsing failed
    const parseError = getFileParseError(fileId);
    if (parseError) throw new Error("errors.fileParseError");

    // Wait for async parsing to finish
    let file = getCachedFile(fileId);
    if (!file) {
      for (let i = 0; i < 6000; i++) {
        throwIfCancelled();
        await new Promise((r) => setTimeout(r, 100));
        file = getCachedFile(fileId);
        if (file) break;
      }
      if (!file) throw new Error("errors.fileParseTimeout");
    }

    // Check cancellation before reading
    throwIfCancelled();

    const chunk = file.text.slice(offset, offset + limit);
    const hasMore = offset + limit < file.text.length;

    return {
      fileId,
      filename: file.filename,
      text: chunk,
      offset,
      length: chunk.length,
      totalSize: file.text.length,
      hasMore,
    };
  },
};
