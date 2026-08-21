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

  // Links may reference a document by its unique path ("glossary/bestiary/331-camel")
  // or archive style without the prefix ("bestiary/331-camel") — resolve those too
  // so path-based wiki-links render as clickable buttons, not plain text.
  const missing = uniqueIds.filter((docId) => !map.has(docId));
  const byKey = new Map<string, { id: string; title: string }>();
  if (missing.length > 0) {
    const prefixes = ["glossary/", "brain/", "hidden/", "visible/"];
    const candidates: string[] = [];
    for (const p of missing) {
      candidates.push(p);
      if (!prefixes.some((pre) => p.startsWith(pre))) candidates.push(`glossary/${p}`);
    }
    const pathDocs = await prisma.document.findMany({
      where: { OR: [{ path: { in: candidates } }, { title: { in: missing } }] },
      select: { id: true, title: true, path: true },
    });
    for (const d of pathDocs) {
      if (d.path) byKey.set(d.path, { id: d.id, title: d.title });
      byKey.set(d.title, { id: d.id, title: d.title });
    }
  }

  return uniqueIds.map((docId) => {
    if (map.has(docId)) {
      return { docId, title: map.get(docId)!, exists: true };
    }
    const hit = byKey.get(docId);
    return {
      docId,
      title: hit ? hit.title : docId,
      exists: !!hit,
    };
  });
}
