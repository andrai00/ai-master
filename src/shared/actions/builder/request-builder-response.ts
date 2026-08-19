"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { assertNotGameMode, GameModeReadOnlyError } from "@/src/shared/lib/db/game-mode-guard";
import { enqueueBuilderJob } from "@/src/shared/lib/queue";
import { runBuilderAgent } from "@/src/shared/lib/agents/builder-runner";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export async function requestBuilderResponseAction(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  try {
    await assertNotGameMode();
  } catch (e) {
    if (e instanceof GameModeReadOnlyError) return { success: false, error: e.message };
    throw e;
  }

  const prisma = getPrisma();

  const last = await prisma.message.findFirst({
    where: { sessionId, role: "admin", summarized: false },
    orderBy: { createdAt: "desc" },
    select: { content: true, hasFiles: true, attachedFiles: true },
  });
  if (!last) return { success: false, error: "errors.emptyMessage" };

  // Pull attached file ids from the latest admin message so the builder
  // processes the files the user just uploaded (files live on the message,
  // not on the request — the upload route no longer auto-starts the agent).
  let fileIds: string[] = [];
  if (last.hasFiles && last.attachedFiles) {
    try {
      const files = JSON.parse(last.attachedFiles) as { fileId: string }[];
      fileIds = files.map((f) => f.fileId).filter(Boolean);
    } catch {
      fileIds = [];
    }
  }

  // Allow running with files only (no text): fall back to a short instruction.
  const rawContent = last.content?.trim() ?? "";
  if (!rawContent && fileIds.length === 0) return { success: false, error: "errors.emptyMessage" };
  const content = rawContent ||
    "File uploaded. Read it and create a glossary document with the appropriate type.";

  broadcastGameEvent("gm_response_requested", { sessionId });

  enqueueBuilderJob(sessionId, content, fileIds).catch((err) => {
    console.error("[builder] Failed to enqueue:", err);
    runBuilderAgent(sessionId, content, fileIds).catch((e) => {
      console.error("[builder] Background processing crashed:", e);
    });
  });

  return { success: true };
}
