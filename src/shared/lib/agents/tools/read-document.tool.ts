import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";
import { assertCanRead } from "./builder-mode-guard";
import { resolveDocId } from "./resolve-doc-id";
import { parseFormulaBlocks } from "@/src/shared/lib/formula/parser";
import { evaluateFormulas } from "@/src/shared/lib/formula/evaluator";
import { normalizeReadContent } from "@/src/shared/lib/documents/read-normalize";
import { supportsFormulaCategory } from "@/src/shared/lib/formula";

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
      id: z.string().describe("Document ID (UUID), path, title, or a link target from a [[...]] wiki-link (e.g. 'spells/207-faerie_fire', 'glossary/races/217-plasmoid', 'Бой D&D 5e'). Auto-resolves to the UUID."),
      offset: z.number().optional().describe("Character offset for chunked reading (default 0)"),
      limit: z.number().optional().describe("Max characters for chunked reading (default 5000); omit both offset and limit to read the whole document"),
    })
  ),
  execute: async (args: { id: string; offset?: number; limit?: number }) => {
    if (isCancelled()) throw new Error("errors.cancelled");
    const prisma = getPrisma();

    // Accept UUID, path, title or a link target from a [[...]] link — the
    // resolver normalizes every form (including bare titles and "glossary/x").
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
        tags: true,
        path: true,
        masterId: true,
      },
    });
    if (!doc) throw new Error("errors.documentNotFound");
    await assertCanRead(doc.category);

    // The model always sees glossary/ prefixed links — normalize on the fly.
    const content = await normalizeReadContent(prisma, doc.masterId, doc.category, doc.content);

    const toc = extractToc(content);

    // Formulas are only meaningful on character sheets and master memory;
    // brain/glossary documents hold formula EXAMPLES and must not be evaluated.
    const formulaData = supportsFormulaCategory(doc.category)
      ? (() => {
          const blocks = parseFormulaBlocks(content);
          const { results } = evaluateFormulas(blocks);
          const formulaValues: Record<string, number> = {};
          const formulaErrors: Record<string, string> = {};
          results.forEach((v) => {
            if (v.value !== null && !v.error) formulaValues[v.name] = v.value;
            else if (v.error) formulaErrors[v.name] = v.error;
          });
          return Object.keys(formulaValues).length > 0 || Object.keys(formulaErrors).length > 0
            ? {
                formulaValues: Object.keys(formulaValues).length > 0 ? formulaValues : undefined,
                formulaErrors: Object.keys(formulaErrors).length > 0 ? formulaErrors : undefined,
              }
            : {};
        })()
      : {};

    if (args.offset !== undefined || args.limit !== undefined) {
      const offset = args.offset ?? 0;
      const limit = args.limit ?? 5000;
      const totalSize = content.length;
      const safeOffset = Math.min(offset, totalSize);
      const chunk = content.slice(safeOffset, safeOffset + limit);
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

    // Full read: the Builder creates, edits and splits documents, so it needs
    // the WHOLE content in one call. No hard cap here — capping forced the
    // model to re-read a 25KB doc in 4 chunks (4 LLM steps instead of 1).
    return { ...doc, source: doc.category, toc, ...formulaData };
  },
};
