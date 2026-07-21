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

  // Ping-pong: instant echo (typing delay is client-side UI)
  const echoText = `Эхо: ${content.trim()}`;
  const builderMsg = await prisma.message.create({
    data: {
      sessionId,
      senderId: session.userId,
      role: "builder",
      content: echoText,
    },
  });

  // Check for auto-summarize every 10 message pairs (20 messages)
  const msgCount = await prisma.message.count({
    where: { sessionId, summarized: false },
  });

  let summaryResult: { id: string; title: string } | undefined;
  if (msgCount >= 20) {
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { masterId: true } });
    const masterId = session!.masterId;

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

    const prevContent = existing?.content ? existing.content.replace(/^📋.*?\n\n/, "") + "\n\n" : "";
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
          title: `Саммари чата настройки`,
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
    adminMessage: { id: adminMsg.id, content: adminMsg.content, createdAt: adminMsg.createdAt },
    builderMessage: { id: builderMsg.id, content: builderMsg.content, createdAt: builderMsg.createdAt },
    summarized: summaryResult,
  };
}
