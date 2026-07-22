"use server";

import { getSession } from "@/src/shared/lib/auth/session";
import { stopProcessing } from "@/src/shared/lib/agents/builder-runner";

export async function stopBuilderAction(
  sessionId: string
): Promise<{ success: boolean }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false };

  const stopped = stopProcessing(sessionId);
  return { success: stopped };
}
