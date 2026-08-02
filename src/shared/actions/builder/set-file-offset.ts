"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export async function setFileOffsetAction(
  fileId: string,
  chunkNumber: number
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  const prisma = getPrisma();
  const file = await prisma.uploadedFile.findUnique({
    where: { id: fileId },
    select: { size: true },
  });
  if (!file) return { success: false, error: "errors.unknownFileId" };

  const offset = Math.min(chunkNumber * 5000, file.size);

  await prisma.uploadedFile.update({
    where: { id: fileId },
    data: { lastReadOffset: offset },
  });

  broadcastGameEvent("file_progress_updated", { fileId });
  return { success: true };
}
