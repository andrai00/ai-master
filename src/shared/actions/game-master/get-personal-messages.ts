"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export interface IPersonalMessage {
  id: string;
  role: string;
  content: string;
  senderId: string;
  summarized: boolean;
  createdAt: Date;
}

export interface IPersonalMessagesResult {
  messages: IPersonalMessage[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getPersonalMessagesAction(
  sessionId: string,
  page: number = 1,
  pageSize: number = 30
): Promise<IPersonalMessagesResult | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "errors.forbidden" };

  const prisma = getPrisma();

  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { masterId: true, type: true, playerId: true },
  });
  if (!s || s.type !== "personal") return { error: "errors.sessionNotFound" };

  if (session.role !== "admin" && s.playerId !== session.userId) {
    return { error: "errors.forbidden" };
  }

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        role: true,
        content: true,
        senderId: true,
        summarized: true,
        createdAt: true,
      },
    }),
    prisma.message.count({ where: { sessionId } }),
  ]);

  return { messages, total, page, pageSize };
}
