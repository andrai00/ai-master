"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { cascadeClearSession } from "@/src/shared/lib/agents/transcript";

export async function clearPersonalChatAction(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  const prisma = getPrisma();

  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { type: true },
  });
  if (!s || s.type !== "personal") return { success: false, error: "errors.sessionNotFound" };

  await cascadeClearSession(sessionId);
  await prisma.message.deleteMany({ where: { sessionId } });
  await prisma.roll.deleteMany({ where: { sessionId } });

  broadcastGameEvent("personal_chat_cleared", { sessionId });

  return { success: true };
}
