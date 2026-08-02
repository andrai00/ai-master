import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { getPrisma } from "@/src/shared/lib/db/prisma";
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
    const limit = args.limit ?? 5000;

    const prisma = getPrisma();
    const file = await prisma.uploadedFile.findUnique({
      where: { id: fileId },
      select: { filename: true, text: true, size: true, status: true, lastReadOffset: true, summary: true, glossarySummary: true },
    });

    if (!file) throw new Error("errors.fileParseError");

    if (isCancelled()) throw new Error("errors.cancelled");

    // Trust DB status over in-memory cache — DB is the source of truth.
    // A stale parse error in the cache does not override a successful parse in DB.
    if (file.status === "error") {
      throw new Error("errors.fileParseError");
    }

    if (file.status === "parsing") {
      return {
        fileId,
        filename: file.filename,
        status: "parsing",
        text: "",
        offset: 0,
        length: 0,
        totalSize: 0,
        hasMore: false,
        summary: file.summary,
        glossarySummary: file.glossarySummary,
        note: "File is still being parsed. Use list_uploaded_files() to check status and try again later.",
      };
    }

    // Default offset to lastReadOffset so the agent continues where it left off.
    // Pass offset=0 explicitly to re-read from the beginning.
    const offset = args.offset ?? file.lastReadOffset;

    const textLength = file.text.length;
    const safeOffset = Math.min(offset, textLength);
    const chunk = file.text.slice(safeOffset, safeOffset + limit);
    const hasMore = safeOffset + limit < textLength;

    if (!chunk && safeOffset >= textLength) {
      return {
        fileId,
        filename: file.filename,
        status: "done",
        text: "[END OF FILE — all content has been read and processed. Call list_uploaded_files() to confirm completion.]",
        offset: textLength,
        length: 0,
        totalSize: textLength,
        hasMore: false,
        summary: file.summary,
        glossarySummary: file.glossarySummary,
      };
    }

    const readEnd = safeOffset + chunk.length;
    if (readEnd > file.lastReadOffset) {
      await prisma.uploadedFile.update({
        where: { id: fileId },
        data: { lastReadOffset: readEnd, lastReadAt: new Date() },
      }).catch(() => { /* non-critical */ });
    }

    return {
      fileId,
      filename: file.filename,
      status: "done",
      text: chunk,
      offset: safeOffset,
      length: chunk.length,
      totalSize: textLength,
      hasMore,
      summary: file.summary,
      glossarySummary: file.glossarySummary,
    };
  },
};
