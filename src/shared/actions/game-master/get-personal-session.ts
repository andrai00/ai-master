"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export async function getPersonalSessionAction(): Promise<{ id: string; name: string } | null> {
  const session = await getSession();
  if (!session) return null;

  const activeGame = await getActiveGame();
  if (!activeGame) return null;

  const prisma = getPrisma();

  let s = await prisma.session.findFirst({
    where: {
      masterId: activeGame.currentMasterId,
      type: "personal",
      playerId: session.userId,
    },
  });

  if (!s) {
    s = await prisma.session.create({
      data: {
        masterId: activeGame.currentMasterId,
        type: "personal",
        playerId: session.userId,
        name: `Personal — ${session.displayName || session.login}`,
      },
    });
  }

  return { id: s.id, name: s.name };
}
