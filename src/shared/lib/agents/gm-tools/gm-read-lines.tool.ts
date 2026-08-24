import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { normalizeReadContent } from "@/src/shared/lib/documents/read-normalize";
import { resolveDocId } from "../tools/resolve-doc-id";
import { readLineRange } from "@/src/shared/lib/documents/line-utils";
import { buildLineToc } from "@/src/shared/lib/documents/sections";

export const gmReadLinesTool = {
  description:
    "Read an exact LINE RANGE (1-based, inclusive) of a document by ID/path/title. Use it to read the section the toc showed (read_document returns each heading's startLine..endLine) or to continue a long read at precise lines without re-reading everything. Returns the plain text of those lines plus totalLines/hasMore. Line numbers match read_document's toc and numbered view. For EDITING lines use read_document(numbered: true) instead.",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID), path, title, or a link target from a [[...]] wiki-link. Auto-resolves."),
      startLine: z.number().describe("1-based number of the FIRST line to read (inclusive)"),
      endLine: z.number().describe("1-based number of the LAST line to read (inclusive)"),
    })
  ),
  execute: async (args: { id: string; startLine: number; endLine: number }) => {
    const activeGame = await getActiveGame();
    if (!activeGame || activeGame.mode !== "game") throw new Error("errors.notInGameMode");

    const prisma = getPrisma();
    const resolvedId = await resolveDocId(args.id);
    const docId = resolvedId ?? args.id;
    const doc = await prisma.document.findFirst({
      where: { id: docId, masterId: activeGame.currentMasterId },
      select: {
        id: true,
        title: true,
        category: true,
        type: true,
        summary: true,
        content: true,
        playerId: true,
        path: true,
        updatedAt: true,
      },
    });
    if (!doc) throw new Error("errors.documentNotFound");

    const content = await normalizeReadContent(prisma, activeGame.currentMasterId, doc.category, doc.content);
    const range = readLineRange(content, args.startLine, args.endLine);
    const toc = buildLineToc(content, 4);

    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      type: doc.type,
      summary: doc.summary,
      playerId: doc.playerId,
      path: doc.path,
      source: doc.category,
      updatedAt: doc.updatedAt,
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
