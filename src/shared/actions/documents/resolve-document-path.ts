"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export async function resolveDocumentByPath(
  path: string
): Promise<{ docId: string; title: string; anchor?: string } | null> {
  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;
  if (!masterId) return null;

  const [pathPart, hashPart] = path.split("#");
  const cleanPath = (pathPart ?? "").replace(/\.md$/i, "");

  if (!cleanPath) return null;

  const prisma = getPrisma();
  const doc = await prisma.document.findFirst({
    where: { masterId, title: cleanPath, status: "active" },
    select: { id: true, title: true },
  });

  if (!doc) return null;

  return {
    docId: doc.id,
    title: doc.title,
    anchor: hashPart || undefined,
  };
}
