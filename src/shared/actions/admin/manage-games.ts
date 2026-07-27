"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame, invalidateActiveGameCache } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

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
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };
  if (!name.trim()) return { success: false, error: "errors.nameEmpty" };

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
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const game = await prisma.master.findUnique({ where: { id } });
  if (!game || game.ownerId !== session.userId) return { success: false, error: "errors.forbidden" };

  const count = await prisma.master.count({ where: { ownerId: session.userId } });
  if (count <= 1) return { success: false, error: "errors.cannotDeleteLastGame" };

  const wasCurrentGame = activeGame ? activeGame.currentMasterId === id : false;

  // Prisma cascades: GameAccess, ActiveGame, Session→Message, Document, UploadedFile, BuilderJob — all deleted automatically
  await prisma.master.delete({ where: { id } });

  if (wasCurrentGame) {
    invalidateActiveGameCache();
    broadcastGameEvent("game_deleted", { masterId: id });
  }

  return { success: true };
}

export async function updateGameAction(
  id: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };
  if (!name.trim()) return { success: false, error: "errors.nameEmpty" };

  const prisma = getPrisma();
  await prisma.master.update({ where: { id }, data: { name: name.trim() } });
  return { success: true };
}

export async function deleteGameWithInfoAction(
  id: string
): Promise<{ success: boolean; error?: string; info?: { sessions: number; messages: number; documents: number } }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "errors.forbidden" };

  const prisma = getPrisma();
  const game = await prisma.master.findUnique({ where: { id } });
  if (!game || game.ownerId !== session.userId) return { success: false, error: "errors.forbidden" };

  const count = await prisma.master.count({ where: { ownerId: session.userId } });
  if (count <= 1) return { success: false, error: "errors.cannotDeleteLastGame" };

  const [sessions, messages, documents] = await Promise.all([
    prisma.session.count({ where: { masterId: id } }),
    prisma.message.count({ where: { session: { masterId: id } } }),
    prisma.document.count({ where: { masterId: id } }),
  ]);

  return { success: true, info: { sessions, messages, documents } };
}
