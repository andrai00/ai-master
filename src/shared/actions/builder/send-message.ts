"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

interface ISendResult {
  adminMessage: { id: string; content: string; createdAt: Date };
  builderMessage: { id: string; content: string; createdAt: Date };
  summarized?: { id: string; title: string };
}

export async function sendBuilderMessageAction(
  sessionId: string,
  content: string
): Promise<ISendResult | { error: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { error: "Нет прав" };
  if (!content.trim()) return { error: "Пустое сообщение" };

  const prisma = getPrisma();

  // Save admin message
  const adminMsg = await prisma.message.create({
    data: {
      sessionId,
      senderId: session.userId,
      role: "admin",
      content: content.trim(),
    },
  });

  // Ping-pong: simulate builder response
  await new Promise((r) => setTimeout(r, 600));
  const echoText = `Эхо: ${content.trim()}`;
  const builderMsg = await prisma.message.create({
    data: {
      sessionId,
      senderId: session.userId,
      role: "builder",
      content: echoText,
    },
  });

  // Check for auto-summarize every 3 message pairs
  const msgCount = await prisma.message.count({
    where: { sessionId, summarized: false },
  });

  let summaryResult: { id: string; title: string } | undefined;
  if (msgCount >= 6) {
    // Summarize all non-summarized messages
    const toSummarize = await prisma.message.findMany({
      where: { sessionId, summarized: false },
      orderBy: { createdAt: "asc" },
      take: 6,
    });

    const preview = toSummarize
      .filter((m) => m.role === "admin")
      .slice(0, 2)
      .map((m) => m.content.slice(0, 30))
      .join("; ");

    // Create summary document
    const doc = await prisma.document.create({
      data: {
        masterId: (await prisma.session.findUnique({ where: { id: sessionId }, select: { masterId: true } }))!.masterId,
        title: `Самари чата — ${new Date().toLocaleString("ru")}`,
        type: "note",
        category: "brain",
        content: `📋 Самари: ${preview}...`,
        summary: preview,
      },
    });

    // Mark messages as summarized
    await prisma.message.updateMany({
      where: { id: { in: toSummarize.map((m) => m.id) } },
      data: { summarized: true },
    });

    summaryResult = { id: doc.id, title: doc.title };
  }

  return {
    adminMessage: { id: adminMsg.id, content: adminMsg.content, createdAt: adminMsg.createdAt },
    builderMessage: { id: builderMsg.id, content: builderMsg.content, createdAt: builderMsg.createdAt },
    summarized: summaryResult,
  };
}
