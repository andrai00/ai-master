"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export interface IResolvedWikiLink {
  docId: string;
  title: string;
  exists: boolean;
}

/**
 * Batch-resolve [[doc-id]] references to human-readable titles.
 * Called by the WikiLink client component.
 */
export async function resolveWikiLinksAction(
  ids: string[]
): Promise<IResolvedWikiLink[]> {
  const session = await getSession();
  if (!session || ids.length === 0) return [];

  const uniqueIds = [...new Set(ids)];
  const prisma = getPrisma();

  const docs = await prisma.document.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, title: true },
  });

  const map = new Map(docs.map((d) => [d.id, d.title]));

  return uniqueIds.map((docId) => ({
    docId,
    title: map.get(docId) || docId,
    exists: map.has(docId),
  }));
}
