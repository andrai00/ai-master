import { z } from "zod";
import { zodSchema } from "@ai-sdk/provider-utils";
import { getCachedFile } from "@/src/shared/lib/agents/file-cache";

export const readParsedFileTool = {
  description:
    "Read a chunk of a previously uploaded and parsed file. Default reads first 5000 characters. Use offset and limit to paginate.",
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

    // Wait for async parsing to finish (upload returns before parsing is done)
    let file = getCachedFile(fileId);
    if (!file) {
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        file = getCachedFile(fileId);
        if (file) break;
      }
      if (!file) throw new Error(`File not found or parse timed out: ${fileId}`);
    }

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
