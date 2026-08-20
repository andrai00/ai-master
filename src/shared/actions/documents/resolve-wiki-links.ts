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

  // Links may reference a document by its path/title (e.g. "spells/223-feather_fall")
  // instead of a raw UUID — resolve those too so path-based wiki-links render
  // as clickable buttons, not plain text.
  const missing = uniqueIds.filter((docId) => !map.has(docId));
  let pathDocs: Array<{ title: string; id: string }> = [];
  if (missing.length > 0) {
    pathDocs = await prisma.document.findMany({
      where: { title: { in: missing } },
      select: { id: true, title: true },
    });
  }
  const titleToId = new Map(pathDocs.map((d) => [d.title, d.id]));

  return uniqueIds.map((docId) => {
    if (map.has(docId)) {
      return { docId, title: map.get(docId)!, exists: true };
    }
    const viaTitle = titleToId.get(docId);
    return {
      docId,
      title: viaTitle || docId,
      exists: !!viaTitle,
    };
  });
}
