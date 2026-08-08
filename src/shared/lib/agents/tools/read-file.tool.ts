import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { getPrisma } from "@/src/shared/lib/db/prisma";

export const readFileTool = {
  description: "Read the full content of a single uploaded .md file by its ID. Use this for single-file uploads (not archives) to determine the document type before creating a glossary entry.",
  inputSchema: zodSchema(
    z.object({
      fileId: z.string().describe("UploadedFile ID"),
    })
  ),
  execute: async (args: { fileId: string }) => {
    if (isCancelled()) throw new Error("errors.cancelled");

    const prisma = getPrisma();
    const file = await prisma.uploadedFile.findUnique({
      where: { id: args.fileId },
      select: { id: true, filename: true, path: true, text: true, size: true, status: true },
    });

    if (!file) throw new Error("errors.unknownFileId");
    if (file.status === "error") throw new Error("errors.fileParseError");

    return {
      fileId: file.id,
      filename: file.filename,
      path: file.path,
      content: file.text,
      size: file.size,
    };
  },
};
