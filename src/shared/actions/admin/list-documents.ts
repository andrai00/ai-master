"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export interface IDocumentItem {
  id: string;
  title: string;
  type: string;
  category: string;
  summary: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function listDocumentsAction(): Promise<IDocumentItem[]> {
  const session = await getSession();
  if (!session || session.role !== "admin") return [];

  const activeGame = await getActiveGame();
  if (!activeGame) return [];

  const prisma = getPrisma();
  const docs = await prisma.document.findMany({
    where: { masterId: activeGame.currentMasterId },
    orderBy: { category: "asc" },
    select: {
      id: true,
      title: true,
      type: true,
      category: true,
      summary: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return docs;
}
