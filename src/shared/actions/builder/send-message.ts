"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { assertNotGameMode, GameModeReadOnlyError } from "@/src/shared/lib/db/game-mode-guard";
import { runBuilderAgent, type IStepLabel } from "@/src/shared/lib/agents/builder-runner";

interface ISendResult {
  adminMessage: { id: string; content: string; createdAt: Date };
  builderMessage: { id: string; content: string; createdAt: Date };
  steps: IStepLabel[];
  summarized?: { id: string; title: string };
}

export async function sendBuilderMessageAction(
  sessionId: string,
  content: string,
  fileIds: string[] = []
): Promise<ISendResult | { error: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { error: "Нет прав" };
  if (!content.trim() && fileIds.length === 0) return { error: "Пустое сообщение" };

  // Builder chat only works in development mode
  try {
    await assertNotGameMode();
  } catch (e) {
    if (e instanceof GameModeReadOnlyError) return { error: e.message };
    throw e;
  }

  const prisma = getPrisma();
  const trimmedContent = content.trim();

  // Save admin message
  const adminMsg = await prisma.message.create({
    data: {
      sessionId,
      senderId: session.userId,
      role: "admin",
      content: trimmedContent,
    },
  });

  // Run AI agent with fileIds
  let builderContent: string;
  let steps: IStepLabel[] = [];
  try {
    const result = await runBuilderAgent(sessionId, trimmedContent, fileIds);
    if (result.kind === "error") {
      builderContent = `❌ Ошибка: ${result.error}`;
    } else {
      builderContent = result.text;
      steps = result.steps;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    builderContent = `❌ Ошибка вызова AI: ${msg}`;
  }

  // Save builder message
  const builderMsg = await prisma.message.create({
    data: {
      sessionId,
      senderId: session.userId,
      role: "builder",
      content: builderContent,
    },
  });

  // Check for auto-summarize every 10 message pairs (20 messages)
  const msgCount = await prisma.message.count({
    where: { sessionId, summarized: false },
  });

  let summaryResult: { id: string; title: string } | undefined;
  if (msgCount >= 20) {
    const sessionData = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { masterId: true },
    });
    const masterId = sessionData!.masterId;

    // Collect messages to summarize
    const toSummarize = await prisma.message.findMany({
      where: { sessionId, summarized: false },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const adminMsgs = toSummarize.filter((m) => m.role === "admin");
    const preview = adminMsgs.map((m) => m.content.slice(0, 40)).join(" | ");

    // Find existing summary doc or create
    const existing = await prisma.document.findFirst({
      where: { masterId, category: "brain", type: "builder_summary" },
    });

    const prevContent = existing?.content
      ? existing.content.replace(/^📋.*?\n\n/, "") + "\n\n"
      : "";
    const newContent = `📋 Саммари чата\n\n${prevContent}🆕 ${preview}`;

    let doc;
    if (existing) {
      doc = await prisma.document.update({
        where: { id: existing.id },
        data: { content: newContent, summary: preview },
      });
    } else {
      doc = await prisma.document.create({
        data: {
          masterId,
          title: "Саммари чата настройки",
          type: "builder_summary",
          category: "brain",
          content: newContent,
          summary: preview,
        },
      });
    }

    // Mark messages as summarized
    await prisma.message.updateMany({
      where: { id: { in: toSummarize.map((m) => m.id) } },
      data: { summarized: true },
    });

    summaryResult = { id: doc.id, title: doc.title };
  }

  return {
    adminMessage: {
      id: adminMsg.id,
      content: adminMsg.content,
      createdAt: adminMsg.createdAt,
    },
    builderMessage: {
      id: builderMsg.id,
      content: builderMsg.content,
      createdAt: builderMsg.createdAt,
    },
    steps,
    summarized: summaryResult,
  };
}
