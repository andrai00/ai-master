"use server";

import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { runBuilderAgent } from "@/src/shared/lib/agents/builder-runner";
import { enqueueBuilderJob } from "@/src/shared/lib/queue";

export async function continueBuilderAction(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  const activeGame = await getActiveGame();
  if (!activeGame) return { success: false, error: "errors.noActiveGame" };

  const prisma = getPrisma();

  const files = await prisma.uploadedFile.findMany({
    where: { masterId: activeGame.currentMasterId },
    select: { id: true, filename: true, size: true, lastReadOffset: true },
  });

  if (files.length === 0) return { success: false, error: "errors.noFilesToContinue" };

  const fileIds = files.map((f) => f.id);
  const activeFiles = files.filter((f) => f.lastReadOffset < f.size);

  let content = "Continue processing the files.";
  if (activeFiles.length > 0) {
    const progress = activeFiles
      .map((f) => {
        const pct = Math.round((f.lastReadOffset / f.size) * 100);
        return `${f.filename}: read up to offset ${f.lastReadOffset} of ${f.size} (${pct}%)`;
      })
      .join("\n- ");
    content += `\n\nProgress so far:\n- ${progress}`;
    content += "\n\nUse read_parsed_file() with the offsets above to continue from where you left off.";
  }

  enqueueBuilderJob(sessionId, content, fileIds).catch((err) => {
    console.error("[builder] Failed to enqueue continue:", err);
    runBuilderAgent(sessionId, content, fileIds).catch((e) => {
      console.error("[builder] Background continue crashed:", e);
    });
  });

  return { success: true };
}
