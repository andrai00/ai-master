import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { CATEGORY_PREFIXES, hasCategoryPrefix, normalizePath, replacePathLinks } from "@/src/shared/lib/documents/paths";
import { assertCanWrite } from "./builder-mode-guard";

const CATEGORY_PREFIX: Record<string, string> = {
  glossary: "glossary/",
  brain: "brain/",
  game_hidden: "hidden/",
  game_visible: "visible/",
};

export const renameDocumentTool = {
  description:
    "Rename a document: change its unique path and AUTOMATICALLY update ALL links to it in every document of the game (both [[path|label]] and archive /path.md forms). Never use update_document to change a path — only this tool. The new path should keep the same category prefix. Works for the GM in game mode (game data) and for the Builder in both modes (only categories writable in the current builder mode).",
  inputSchema: zodSchema(
    z.object({
      id: z.string().describe("Document ID (UUID) of the document to rename"),
      newPath: z.string().describe("New unique path, e.g. 'glossary/bestiary/331-camel' (with category prefix)"),
    })
  ),
  execute: async (args: { id: string; newPath: string }) => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.notInGameMode");

    const prisma = getPrisma();
    const masterId = activeGame.currentMasterId;

    const doc = await prisma.document.findFirst({
      where: { id: args.id, masterId },
      select: { id: true, category: true, path: true, title: true },
    });
    if (!doc) throw new Error("errors.documentNotFound");

    // Permission guard: in game mode the GM may rename only game data;
    // in builder (development) mode only the categories writable in the
    // current builder mode (brain mode: glossary/brain, memory mode: game_hidden/game_visible).
    if (activeGame.mode === "game") {
      if (doc.category === "glossary" || doc.category === "brain") {
        throw new Error("errors.cannotWriteInMode: glossary and brain are read-only in game mode");
      }
    } else {
      await assertCanWrite(doc.category);
    }

    const prefix = CATEGORY_PREFIX[doc.category] ?? "glossary/";
    const desired = normalizePath(args.newPath);
    if (!desired) throw new Error("errors.invalidPath");
    const newPath = hasCategoryPrefix(desired) ? desired : `${prefix}${desired}`;

    const chosenPrefix = CATEGORY_PREFIXES.find((p) => newPath.startsWith(p));
    if (chosenPrefix && chosenPrefix !== prefix) {
      throw new Error("errors.invalidPath: new path must keep the same category prefix");
    }

    const clash = await prisma.document.findFirst({
      where: { masterId, path: newPath, id: { not: doc.id } },
      select: { id: true },
    });
    if (clash) throw new Error(`errors.pathBusy: ${newPath}`);

    const oldPath = doc.path ?? doc.title;
    const docs = await prisma.document.findMany({
      where: { masterId },
      select: { id: true, content: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id: doc.id }, data: { path: newPath } });
      for (const d of docs) {
        const next = replacePathLinks(d.content, oldPath, newPath);
        if (next !== d.content) {
          await tx.document.update({ where: { id: d.id }, data: { content: next } });
        }
      }
    });

    broadcastGameEvent("document_updated", { masterId, documentId: doc.id });
    return { id: doc.id, oldPath, newPath, updated: true };
  },
};
