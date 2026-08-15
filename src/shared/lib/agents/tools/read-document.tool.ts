import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";
import { assertCanRead } from "./builder-mode-guard";
import { resolveDocId } from "./resolve-doc-id";
import { parseFormulaBlocks } from "@/src/shared/lib/formula/parser";
import { evaluateFormulas } from "@/src/shared/lib/formula/evaluator";

interface ITocEntry {
  heading: string;
  level: number;
  offset: number;
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/gm;

function cleanHeading(text: string): string {
  return text
    .replace(/\[\[[^\]|#]+(?:#[^\]]+)?(?:\|([^\]]+))?\]\]/g, (_, display) => display ? display.trim() : "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function extractToc(content: string): ITocEntry[] {
  const toc: ITocEntry[] = [];
  let match: RegExpExecArray | null;
  HEADING_RE.lastIndex = 0;
  while ((match = HEADING_RE.exec(content)) !== null) {
    toc.push({
      heading: cleanHeading(match[2]),
      level: match[1].length,
      offset: match.index,
    });
  }
  return toc;
}

export const readDocumentTool = {
  description: TOOL_DESCRIPTIONS.read_document,
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID) or path (e.g. 'spells/207-faerie_fire' or '/spells/207-faerie_fire.md'). If contains '/' or ends with '.md' — treated as path/title, auto-resolved to UUID."),
      offset: z.number().optional().describe("Character offset for chunked reading (default 0 = full document)"),
      limit: z.number().optional().describe("Max characters for chunked reading (omit for full document)"),
    })
  ),
  execute: async (args: { id: string; offset?: number; limit?: number }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    const prisma = getPrisma();

    let docId = args.id;
    if (docId.includes("/") || docId.endsWith(".md")) {
      const resolved = await resolveDocId(docId);
      if (resolved) docId = resolved;
    }

    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: {
        id: true,
        title: true,
        category: true,
        type: true,
        summary: true,
        content: true,
        tags: true,
      },
    });
    if (!doc) throw new Error("errors.documentNotFound");
    await assertCanRead(doc.category);

    const toc = extractToc(doc.content);

    const blocks = parseFormulaBlocks(doc.content);
    const { results, errors } = evaluateFormulas(blocks);
    const formulaValues: Record<string, number> = {};
    results.forEach((v) => { if (v.value !== null) formulaValues[v.name] = v.value; });
    const formulaData = Object.keys(formulaValues).length > 0
      ? { formulaValues, formulaErrors: errors.length > 0 ? errors : undefined }
      : {};

    if (args.offset !== undefined || args.limit !== undefined) {
      const offset = args.offset ?? 0;
      const limit = args.limit ?? 5000;
      const totalSize = doc.content.length;
      const safeOffset = Math.min(offset, totalSize);
      const chunk = doc.content.slice(safeOffset, safeOffset + limit);
      const hasMore = safeOffset + limit < totalSize;
      return {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        type: doc.type,
        summary: doc.summary,
        text: chunk,
        offset: safeOffset,
        length: chunk.length,
        totalSize,
        hasMore,
        toc,
        ...formulaData,
      };
    }

    return { ...doc, toc, ...formulaData };
  },
};
