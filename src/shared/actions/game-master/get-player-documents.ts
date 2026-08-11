"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export interface IPlayerDocument {
  id: string;
  title: string;
  type: string;
  section: string | null;
  order: number;
}

export async function getPlayerDocumentsAction(): Promise<IPlayerDocument[]> {
  const session = await getSession();
  if (!session) return [];

  const activeGame = await getActiveGame();
  if (!activeGame) return [];

  const prisma = getPrisma();

  const docs = await prisma.document.findMany({
    where: {
      masterId: activeGame.currentMasterId,
      category: "game_visible",
      OR: [
        { playerId: session.userId },
        { playerId: null },
        { access: { some: { userId: session.userId } } },
      ],
    },
    select: { id: true, title: true, type: true, section: true, order: true },
    orderBy: [{ section: "asc" }, { order: "asc" }, { title: "asc" }],
  });

  return docs;
}
