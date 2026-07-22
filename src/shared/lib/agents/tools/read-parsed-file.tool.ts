import { z } from "zod";
import { zodSchema } from "@ai-sdk/provider-utils";
import { getCachedFile } from "@/src/shared/lib/agents/file-cache";

export const readParsedFileTool = {
  description:
    "Read a chunk of a previously uploaded and parsed file. Default reads first 3000 characters. Use offset and limit to paginate.",
  inputSchema: zodSchema(
    z.object({
      fileId: z.string().describe("File ID from upload"),
      offset: z.number().optional().describe("Character offset (default 0)"),
      limit: z.number().optional().describe("Max characters (default 3000)"),
    })
  ),
  execute: async (args: { fileId: string; offset?: number; limit?: number }) => {
    const { fileId } = args;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 3000;
    const file = getCachedFile(fileId);
    if (!file) throw new Error(`File not found or expired: ${fileId}`);

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
