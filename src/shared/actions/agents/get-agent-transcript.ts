"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export interface ITranscriptRow {
  id: string;
  runId: string;
  kind: string;
  toolName: string | null;
  toolCallId: string | null;
  args: string | null;
  result: string | null;
  content: string | null;
  status: string;
  summarized: boolean;
  createdAt: Date;
}

/**
 * Returns the agent's internal transcript for a session (tool calls, args,
 * results, partial text). Only available in debug mode (AGENT_DEBUG=1 env),
 * for the admin role, and only for the CURRENT game's session — exactly like
 * the "internals" Cursor/Kilo show.
 */
export async function getAgentTranscriptAction(
  sessionId: string
): Promise<{ rows: ITranscriptRow[]; enabled: boolean } | { error: string; enabled: boolean }> {
  const enabled = process.env.AGENT_DEBUG === "1";
  if (!enabled) return { error: "errors.forbidden", enabled: false };

  const session = await getSession();
  if (!session || session.role !== "admin") return { error: "errors.forbidden", enabled: false };

  const prisma = getPrisma();
  const activeGame = await getActiveGame();

  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { masterId: true },
  });
  // Filter by the current game: never leak another game's internals.
  if (!s || !activeGame || s.masterId !== activeGame.currentMasterId) {
    return { error: "errors.noGame", enabled: true };
  }

  const rows = await prisma.agentTranscript.findMany({
    where: { sessionId },
    orderBy: { seq: "asc" },
    take: 500,
    select: {
      id: true,
      runId: true,
      kind: true,
      toolName: true,
      toolCallId: true,
      args: true,
      result: true,
      content: true,
      status: true,
      summarized: true,
      createdAt: true,
    },
  });

  return { rows, enabled: true };
}
