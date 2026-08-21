"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { CATEGORY_PREFIXES, stripCategoryPrefix } from "@/src/shared/lib/documents/paths";

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

  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;
  if (!masterId) return ids.map((docId) => ({ docId, title: docId, exists: false }));

  const uniqueIds = [...new Set(ids)];
  const prisma = getPrisma();

  const byId = await prisma.document.findMany({
    where: { id: { in: uniqueIds }, masterId },
    select: { id: true, title: true },
  });

  const map = new Map(byId.map((d) => [d.id, d.title]));

  // Links may reference a document by its unique path ("glossary/bestiary/331-camel")
  // or archive style without the prefix ("bestiary/331-camel") — and glossary links
  // may carry the "glossary/" prefix or omit it. Resolve id, path and title, matching
  // titles in both prefixed and unprefixed form so [[glossary/x]] and [[x]] work alike.
  const missing = uniqueIds.filter((docId) => !map.has(docId));
  const byKey = new Map<string, { id: string; title: string }>();
  if (missing.length > 0) {
    const candidates: string[] = [];
    for (const p of missing) {
      candidates.push(p);
      if (!CATEGORY_PREFIXES.some((pre) => p.startsWith(pre))) candidates.push(`glossary/${p}`);
    }
    const titleKeys = missing.flatMap((p) => [p, stripCategoryPrefix(p)]);
    const pathDocs = await prisma.document.findMany({
      where: { masterId, OR: [{ path: { in: candidates } }, { title: { in: titleKeys } }] },
      select: { id: true, title: true, path: true },
    });
    for (const d of pathDocs) {
      if (d.path) byKey.set(d.path, { id: d.id, title: d.title });
      byKey.set(d.title, { id: d.id, title: d.title });
      byKey.set(stripCategoryPrefix(d.title), { id: d.id, title: d.title });
      if (d.path) byKey.set(stripCategoryPrefix(d.path), { id: d.id, title: d.title });
    }
  }

  return uniqueIds.map((docId) => {
    if (map.has(docId)) {
      return { docId, title: map.get(docId)!, exists: true };
    }
    const hit = byKey.get(docId) ?? byKey.get(stripCategoryPrefix(docId));
    return {
      docId,
      title: hit ? hit.title : docId,
      exists: !!hit,
    };
  });
}
