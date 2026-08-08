"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export interface IDocumentData {
  id: string;
  title: string;
  type: string;
  category: string;
  content: string;
  summary: string | null;
  tags: string[];
}

export async function getDocumentAction(docId: string): Promise<IDocumentData | null> {
  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;
  if (!masterId) return null;

  const prisma = getPrisma();
  const doc = await prisma.document.findFirst({
    where: { id: docId, masterId },
    select: { id: true, title: true, type: true, category: true, content: true, summary: true, tags: true },
  });
  if (!doc) return null;

  return { ...doc, tags: JSON.parse(doc.tags) };
}
