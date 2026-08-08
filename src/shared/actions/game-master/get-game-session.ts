"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export async function getGameSessionAction(): Promise<{ id: string; name: string } | null> {
  const session = await getSession();
  if (!session) return null;

  const activeGame = await getActiveGame();
  if (!activeGame) return null;

  const prisma = getPrisma();

  if (session.role !== "admin") {
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId: activeGame.currentMasterId } },
    });
    if (!access) return null;
  }

  let s = await prisma.session.findFirst({
    where: { masterId: activeGame.currentMasterId, type: "game" },
  });

  if (!s) {
    s = await prisma.session.create({
      data: {
        masterId: activeGame.currentMasterId,
        type: "game",
        name: "Game Chat",
      },
    });
  }

  return { id: s.id, name: s.name };
}
