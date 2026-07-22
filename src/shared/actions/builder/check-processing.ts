"use server";

import { getSession } from "@/src/shared/lib/auth/session";
import { isProcessing } from "@/src/shared/lib/agents/builder-runner";

export async function checkProcessingAction(
  sessionId: string
): Promise<{ processing: boolean }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { processing: false };

  return { processing: isProcessing(sessionId) };
}
