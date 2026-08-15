"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { stopProcessing } from "@/src/shared/lib/agents/builder-runner";
import { cancelAll } from "@/src/shared/lib/agents/parse-cancel";
import { emitStopped } from "@/src/shared/lib/agents/step-tracker";

export async function stopBuilderAction(
  sessionId: string
): Promise<{ success: boolean }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false };

  cancelAll();
  const stopped = stopProcessing(sessionId);

  if (stopped) {
    emitStopped(sessionId);
  }

  const prisma = getPrisma();
  await prisma.builderJob.updateMany({
    where: { sessionId, status: "processing" },
    data: { status: "failed", error: "Stopped by user" },
  });

  return { success: stopped };
}
