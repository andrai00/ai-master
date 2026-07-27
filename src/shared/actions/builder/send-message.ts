"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { assertNotGameMode, GameModeReadOnlyError } from "@/src/shared/lib/db/game-mode-guard";
import { runBuilderAgent } from "@/src/shared/lib/agents/builder-runner";
import { enqueueBuilderJob } from "@/src/shared/lib/queue";

export async function sendBuilderMessageAction(
  sessionId: string,
  content: string,
  fileIds: string[] = [],
  fileNames: string[] = []
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };
  if (!content.trim() && fileIds.length === 0) return { success: false, error: "errors.emptyMessage" };

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

  await prisma.message.create({
    data: {
      sessionId,
      senderId: session.userId,
      role: "admin",
      content: content.trim(),
      hasFiles: fileIds.length > 0,
      attachedFiles: JSON.stringify(attachedFiles),
    },
  });

  enqueueBuilderJob(sessionId, content.trim(), fileIds).catch((err) => {
    console.error("[builder] Failed to enqueue:", err);
    runBuilderAgent(sessionId, content.trim(), fileIds).catch((e) => {
      console.error("[builder] Background processing crashed:", e);
    });
  });

  return { success: true };
}
