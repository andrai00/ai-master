"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { assertNotGameMode, GameModeReadOnlyError } from "@/src/shared/lib/db/game-mode-guard";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { cascadeClearSession } from "@/src/shared/lib/agents/transcript";

export async function clearBuilderChatAction(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  // Clearing brain documents only allowed in development mode
  try {
    await assertNotGameMode();
  } catch (e) {
    if (e instanceof GameModeReadOnlyError) return { success: false, error: e.message };
    throw e;
  }

  const prisma = getPrisma();

  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { masterId: true },
  });
  if (!s) return { success: false, error: "errors.sessionNotFound" };

  // Delete all messages
  await cascadeClearSession(sessionId);
  await prisma.message.deleteMany({ where: { sessionId } });

  // Delete summary documents (both old "note" and new "builder_summary" types)
  await prisma.document.deleteMany({
    where: {
      masterId: s.masterId,
      category: "brain",
      OR: [{ type: "builder_summary" }, { type: "note" }],
    },
  });

  broadcastGameEvent("builder_chat_cleared", { sessionId });

  return { success: true };
}
