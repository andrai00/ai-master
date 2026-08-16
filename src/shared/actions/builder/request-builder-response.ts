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
    select: { content: true },
  });
  if (!last || !last.content.trim()) return { success: false, error: "errors.emptyMessage" };

  broadcastGameEvent("gm_response_requested", { sessionId });

  const content = last.content.trim();
  enqueueBuilderJob(sessionId, content, []).catch((err) => {
    console.error("[builder] Failed to enqueue:", err);
    runBuilderAgent(sessionId, content, []).catch((e) => {
      console.error("[builder] Background processing crashed:", e);
    });
  });

  return { success: true };
}
