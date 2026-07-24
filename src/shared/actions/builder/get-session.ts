"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export async function getBuilderSessionAction(): Promise<{ id: string; name: string; builderMode: string } | null> {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;

  const activeGame = await getActiveGame();
  if (!activeGame) return null;

  const prisma = getPrisma();

  let s = await prisma.session.findFirst({
    where: { masterId: activeGame.currentMasterId, type: "builder" },
  });

  if (!s) {
    s = await prisma.session.create({
      data: {
        masterId: activeGame.currentMasterId,
        type: "builder",
        name: "AI Master Setup",
      },
    });
  }

  return { id: s.id, name: s.name, builderMode: s.builderMode };
}
