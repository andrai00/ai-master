"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { assertNotGameMode, GameModeReadOnlyError } from "@/src/shared/lib/db/game-mode-guard";
import { runBuilderAgent } from "@/src/shared/lib/agents/builder-runner";

export async function sendBuilderMessageAction(
  sessionId: string,
  content: string,
  fileIds: string[] = []
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "Нет прав" };
  if (!content.trim() && fileIds.length === 0) return { success: false, error: "Пустое сообщение" };

  try {
    await assertNotGameMode();
  } catch (e) {
    if (e instanceof GameModeReadOnlyError) return { success: false, error: e.message };
    throw e;
  }

  const prisma = getPrisma();

  // Save admin message
  await prisma.message.create({
    data: {
      sessionId,
      senderId: session.userId,
      role: "admin",
      content: content.trim(),
      hasFiles: fileIds.length > 0,
    },
  });

  // Fire-and-forget: process in background, don't await
  runBuilderAgent(sessionId, content.trim(), fileIds).catch((err) => {
    console.error("[builder] Background processing crashed:", err);
  });

  return { success: true };
}
