"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { assertNotGameMode, GameModeReadOnlyError } from "@/src/shared/lib/db/game-mode-guard";
import { broadcastMessageCreated } from "@/src/shared/lib/events/game-events";
import { isProcessing } from "@/src/shared/lib/agents/builder-runner";

export async function sendBuilderMessageAction(
  sessionId: string,
  content: string,
  fileIds: string[] = [],
  fileNames: string[] = []
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };
  if (!content.trim() && fileIds.length === 0) return { success: false, error: "errors.emptyMessage" };

  if (isProcessing(sessionId)) return { success: false, error: "chat.processingBlocked" };

  try {
    await assertNotGameMode();
  } catch (e) {
    if (e instanceof GameModeReadOnlyError) return { success: false, error: e.message };
    throw e;
  }

  const prisma = getPrisma();

  const attachedFiles = fileIds.map((id, i) => ({
    fileId: id,
    filename: fileNames[i] ?? id,
  }));

  const created = await prisma.message.create({
    data: {
      sessionId,
      senderId: session.userId,
      role: "admin",
      content: content.trim(),
      hasFiles: fileIds.length > 0,
      attachedFiles: JSON.stringify(attachedFiles),
    },
    include: { sender: { select: { displayName: true, avatar: true } } },
  });

  broadcastMessageCreated("builder_message_sent", sessionId, created);

  return { success: true };
}
