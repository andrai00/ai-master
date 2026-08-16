import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const gmGetPlayersTool = {
  description:
    "List everyone who has access to the current game (both admins and players — the AI is the GM, human admin accounts are participants too) and how engaged they are. Returns for each participant: display name, role, number of documents linked to them (character sheet and personal data — 0 means they are still a viewer and have not created a character), and the time of their last message in the game chat. Use periodically to see who is active, who is idle, and who has not started playing yet.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();

    const players = await prisma.user.findMany({
      where: { gameAccess: { some: { masterId: activeGame.currentMasterId } } },
      select: { id: true, displayName: true, login: true, role: true },
      orderBy: { displayName: "asc" },
    });

    const docCounts = await prisma.document.groupBy({
      by: ["playerId"],
      where: { masterId: activeGame.currentMasterId, playerId: { not: null } },
      _count: { _all: true },
    });
    const docCountMap = new Map(docCounts.map((d) => [d.playerId!, d._count._all]));

    const gameSession = await prisma.session.findFirst({
      where: { masterId: activeGame.currentMasterId, type: "game" },
      select: { id: true },
    });

    const lastMsgMap = new Map<string, Date>();
    if (gameSession) {
      const lastMsgs = await prisma.message.groupBy({
        by: ["senderId"],
        where: { sessionId: gameSession.id },
        _max: { createdAt: true },
      });
      for (const m of lastMsgs) {
        if (m._max.createdAt) lastMsgMap.set(m.senderId, m._max.createdAt);
      }
    }

    return players.map((p) => ({
      id: p.id,
      name: p.displayName || p.login,
      role: p.role,
      documentCount: docCountMap.get(p.id) ?? 0,
      lastMessageAt: lastMsgMap.get(p.id)?.toISOString() ?? null,
    }));
  },
};
