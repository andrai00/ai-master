import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";

export const updateFileSummaryTool = {
  description: TOOL_DESCRIPTIONS.update_file_summary,
  inputSchema: zodSchema(
    z.object({
      fileId: z.string().describe("File ID from upload"),
      summary: z.string().optional().describe("Notes about file contents: what was read, key chapters, where text breaks"),
      glossarySummary: z.string().optional().describe("What was saved to glossary from this file: which documents created/updated, what topics covered"),
    })
  ),
  execute: async (args: { fileId: string; summary?: string; glossarySummary?: string }) => {
    if (isCancelled()) throw new Error("errors.cancelled");

    const data: Record<string, string> = {};
    if (args.summary !== undefined) data.summary = args.summary;
    if (args.glossarySummary !== undefined) data.glossarySummary = args.glossarySummary;

    if (Object.keys(data).length === 0) return { updated: false };

    const prisma = getPrisma();
    await prisma.uploadedFile.update({
      where: { id: args.fileId },
      data,
    });

    return { updated: true };
  },
};
