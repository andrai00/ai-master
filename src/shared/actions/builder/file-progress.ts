"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export interface IFileProgressItem {
  fileId: string;
  filename: string;
  totalSize: number;
  readOffset: number;
  status: "parsing" | "done" | "error";
}

export async function getFileProgressAction(): Promise<IFileProgressItem[]> {
  const session = await getSession();
  if (!session || session.role !== "admin") return [];

  const activeGame = await getActiveGame();
  if (!activeGame) return [];

  const prisma = getPrisma();
  const files = await prisma.uploadedFile.findMany({
    where: { masterId: activeGame.currentMasterId },
    select: { id: true, filename: true, size: true, lastReadOffset: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  return files.map((f) => ({
    fileId: f.id,
    filename: f.filename,
    totalSize: f.size,
    readOffset: f.lastReadOffset,
    status: (f.status as IFileProgressItem["status"]) ?? "parsing",
  }));
}

export async function removeUploadedFileAction(fileId: string): Promise<boolean> {
  const session = await getSession();
  if (!session || session.role !== "admin") return false;

  const prisma = getPrisma();
  await prisma.uploadedFile.delete({ where: { id: fileId } }).catch(() => {});
  broadcastGameEvent("file_removed", { fileId });
  return true;
}
