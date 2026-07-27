"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export interface IBuilderMessage {
  id: string;
  role: string;
  content: string;
  senderId: string;
  summarized: boolean;
  hasFiles: boolean;
  attachedFiles: { fileId: string; filename: string }[];
  createdAt: Date;
}

export interface IBuilderMessagesResult {
  messages: IBuilderMessage[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getBuilderMessagesAction(
  sessionId: string,
  page: number = 1,
  pageSize: number = 30
): Promise<IBuilderMessagesResult | { error: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { error: "errors.forbidden" };

  const prisma = getPrisma();

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
        hasFiles: true,
        attachedFiles: true,
        createdAt: true,
      },
    }),
    prisma.message.count({ where: { sessionId } }),
  ]);

  return { messages: messages.map((m) => {
    let attachedFiles: { fileId: string; filename: string }[] = [];
    try { attachedFiles = JSON.parse(m.attachedFiles); } catch { /* keep default */ }
    return { ...m, attachedFiles };
  }), total, page, pageSize };
}
