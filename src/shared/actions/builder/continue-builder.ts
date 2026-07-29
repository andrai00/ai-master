"use server";

import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { runBuilderAgent } from "@/src/shared/lib/agents/builder-runner";
import { enqueueBuilderJob } from "@/src/shared/lib/queue";

/** Called from upload route after all parsing completes — no auth check needed (already passed). */
export async function autoContinueBuilder(sessionId: string): Promise<void> {
  const activeGame = await getActiveGame();
  if (!activeGame) return;

  const prisma = getPrisma();
  const files = await prisma.uploadedFile.findMany({
    where: { masterId: activeGame.currentMasterId },
    select: { id: true, filename: true, size: true, lastReadOffset: true },
    orderBy: { createdAt: "asc" },
  });

  if (files.length === 0) return;

  const fileIds = files.map((f) => f.id);
  const activeFiles = files.filter((f) => f.lastReadOffset < f.size);

  if (activeFiles.length === 0) return;

  const fileList = activeFiles
    .map((f, i) => {
      const pct = Math.round((f.lastReadOffset / f.size) * 100);
      return `${i + 1}. ${f.filename}: offset ${f.lastReadOffset}/${f.size} (${pct}%)`;
    })
    .join("\n");

  const content =
    "Continue processing files IN ORDER — finish each completely before moving to the next.\n\n" +
    `Files to process:\n${fileList}\n\n` +
    "IMPORTANT: Process ALL files. Do NOT write a response or stop until every file is fully read. " +
    "After finishing a file, call list_uploaded_files() to check for remaining files. " +
    "Only respond when ALL files are done or if you encounter an error.";

  enqueueBuilderJob(sessionId, content, fileIds).catch((err) => {
    console.error("[builder] Failed to enqueue auto-continue:", err);
    runBuilderAgent(sessionId, content, fileIds).catch((e) => {
      console.error("[builder] Auto-continue agent crashed:", e);
    });
  });
}

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
    orderBy: { createdAt: "asc" },
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
