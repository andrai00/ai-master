import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";
import { assertCanRead } from "./builder-mode-guard";
import { resolveDocId } from "./resolve-doc-id";
import { normalizeReadContent } from "@/src/shared/lib/documents/read-normalize";
import { readLineRange } from "@/src/shared/lib/documents/line-utils";
import { buildLineToc } from "@/src/shared/lib/documents/sections";

export const readLinesTool = {
  description: TOOL_DESCRIPTIONS.read_lines,
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID), path, title, or a link target from a [[...]] wiki-link. Auto-resolves to the UUID."),
      startLine: z.number().describe("1-based number of the FIRST line to read (inclusive)"),
      endLine: z.number().describe("1-based number of the LAST line to read (inclusive)"),
    })
  ),
  execute: async (args: { id: string; startLine: number; endLine: number }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    const prisma = getPrisma();

    let docId = args.id;
    const resolved = await resolveDocId(docId);
    if (resolved) docId = resolved;
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: {
        id: true,
        title: true,
        category: true,
        type: true,
        summary: true,
        content: true,
        path: true,
        masterId: true,
      },
    });
    if (!doc) throw new Error("errors.documentNotFound");
    await assertCanRead(doc.category);

    const content = await normalizeReadContent(prisma, doc.masterId, doc.category, doc.content);
    const range = readLineRange(content, args.startLine, args.endLine);
    const toc = buildLineToc(content);

    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      type: doc.type,
      summary: doc.summary,
      path: doc.path,
      source: doc.category,
      mode: "lines",
      text: range.text,
      startLine: range.startLine,
      endLine: range.endLine,
      lineCount: range.endLine - range.startLine + 1,
      totalLines: range.totalLines,
      hasMore: range.hasMore,
      toc,
    };
  },
};
