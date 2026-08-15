"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export interface IGameMessage {
  id: string;
  role: string;
  content: string;
  senderId: string;
  senderDisplayName: string;
  senderAvatar: string;
  shared: boolean;
  summarized: boolean;
  createdAt: Date;
}

export interface IGameMessagesResult {
  messages: IGameMessage[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getGameMessagesAction(
  sessionId: string,
  page: number = 1,
  pageSize: number = 30
): Promise<IGameMessagesResult | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "errors.forbidden" };

  const prisma = getPrisma();

  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { masterId: true, type: true },
  });
  if (!s || s.type !== "game") return { error: "errors.sessionNotFound" };

  if (session.role !== "admin") {
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId: s.masterId } },
    });
    if (!access) return { error: "errors.noGameAccess" };
  }

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        role: true,
        content: true,
        senderId: true,
        sender: { select: { displayName: true, avatar: true } },
        shared: true,
        summarized: true,
        createdAt: true,
      },
    }),
    prisma.message.count({ where: { sessionId } }),
  ]);

  return { messages: messages.map((m) => {
    const { sender, ...rest } = m as typeof m & { sender: { displayName: string; avatar: string } };
    return { ...rest, senderDisplayName: sender.displayName, senderAvatar: sender.avatar };
  }), total, page, pageSize };
}
