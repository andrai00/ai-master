"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export type TBuilderMode = "brain" | "memory";

export async function setBuilderModeAction(
  sessionId: string,
  mode: TBuilderMode
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  const prisma = getPrisma();
  const s = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!s || s.type !== "builder") return { success: false, error: "errors.sessionNotFound" };

  await prisma.session.update({
    where: { id: sessionId },
    data: { builderMode: mode },
  });

  broadcastGameEvent("builder_mode_change", { sessionId, mode });

  return { success: true };
}

export async function getBuilderModeAction(
  sessionId: string
): Promise<TBuilderMode | null> {
  const session = await getSession();
  if (!session) return null;

  const prisma = getPrisma();
  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { builderMode: true },
  });
  return (s?.builderMode as TBuilderMode) ?? "brain";
}
