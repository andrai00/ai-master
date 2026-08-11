"use server";

import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { stopProcessing, emitStopped } from "@/src/shared/lib/agents/gm-runner";

export async function stopGameMasterResponseAction(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  stopProcessing(sessionId);
  emitStopped(sessionId);
  broadcastGameEvent("gm_response_stopped", { sessionId });

  return { success: true };
}
