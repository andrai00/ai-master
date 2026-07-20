"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export interface IGameItem {
  id: string;
  name: string;
  description: string | null;
  isCurrent: boolean;
}

export async function listGamesAction(): Promise<IGameItem[]> {
  const session = await getSession();
  if (!session) return [];

  const prisma = getPrisma();
  const activeGame = await getActiveGame();

  const games = await prisma.master.findMany({
    where: {
      OR: [
        { ownerId: session.userId },
        { access: { some: { userId: session.userId } } },
      ],
    },
    select: { id: true, name: true, description: true },
    orderBy: { createdAt: "asc" },
  });

  return games.map((g) => ({
    ...g,
    isCurrent: activeGame ? g.id === activeGame.currentMasterId : false,
  }));
}

export async function getCurrentGameAction(): Promise<IGameItem | null> {
  const session = await getSession();
  if (!session) return null;

  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  if (!activeGame) return null;

  const game = await prisma.master.findFirst({
    where: {
      id: activeGame.currentMasterId,
      OR: [
        { ownerId: session.userId },
        { access: { some: { userId: session.userId } } },
      ],
    },
    select: { id: true, name: true, description: true },
  });

  if (!game) return null;

  return { ...game, isCurrent: true };
}

export async function createGameAction(
  name: string,
  description?: string
): Promise<{ success: boolean; error?: string; id?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "Нет прав" };
  if (!name.trim()) return { success: false, error: "Название не может быть пустым" };

  const prisma = getPrisma();
  const game = await prisma.master.create({
    data: { ownerId: session.userId, name: name.trim(), description: description || null },
  });
  return { success: true, id: game.id };
}

export async function deleteGameAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "Нет прав" };

  const prisma = getPrisma();
  const game = await prisma.master.findUnique({ where: { id } });
  if (!game || game.ownerId !== session.userId) return { success: false, error: "Нет прав" };

  const count = await prisma.master.count({ where: { ownerId: session.userId } });
  if (count <= 1) return { success: false, error: "Нельзя удалить последнюю игру" };

  await prisma.master.delete({ where: { id } });
  return { success: true };
}

export async function updateGameAction(
  id: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "Нет прав" };
  if (!name.trim()) return { success: false, error: "Название не может быть пустым" };

  const prisma = getPrisma();
  await prisma.master.update({ where: { id }, data: { name: name.trim() } });
  return { success: true };
}

export async function deleteGameWithInfoAction(
  id: string
): Promise<{ success: boolean; error?: string; info?: { sessions: number; documents: number } }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "Нет прав" };

  const prisma = getPrisma();
  const game = await prisma.master.findUnique({ where: { id } });
  if (!game || game.ownerId !== session.userId) return { success: false, error: "Нет прав" };

  const count = await prisma.master.count({ where: { ownerId: session.userId } });
  if (count <= 1) return { success: false, error: "Нельзя удалить последнюю игру" };

  return { success: true, info: { sessions: 0, documents: 0 } };
}
