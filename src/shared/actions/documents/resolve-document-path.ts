"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { CATEGORY_PREFIXES, normalizePath, stripCategoryPrefix } from "@/src/shared/lib/documents/paths";

export { normalizePath };

export async function resolveDocumentByPath(
  path: string
): Promise<{ docId: string; title: string; anchor?: string } | null> {
  const session = await getSession();
  if (!session) return null;

  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;
  if (!masterId) return null;

  const [pathPart, hashPart] = path.split("#");
  const cleanPath = normalizePath(pathPart ?? "");
  if (!cleanPath) return null;

  const prisma = getPrisma();

  // 1) Exact path match.
  let doc = await prisma.document.findFirst({
    where: { masterId, path: cleanPath, status: "active" },
    select: { id: true, title: true },
  });

  // 2) Archive-internal links have no category prefix ("/bestiary/331-camel.md").
  //    When the path doesn't start with a known category, try glossary/ first.
  if (!doc && !CATEGORY_PREFIXES.some((p) => cleanPath.startsWith(p))) {
    doc = await prisma.document.findFirst({
      where: { masterId, path: `glossary/${cleanPath}`, status: "active" },
      select: { id: true, title: true },
    });
  }

  // 3) Legacy fallback by exact title (documents whose path predates the backfill).
  if (!doc) {
    doc = await prisma.document.findFirst({
      where: { masterId, title: cleanPath, status: "active" },
      select: { id: true, title: true },
    });
  }

  // 4) Title match with the category prefix stripped ("glossary/x" -> title "x").
  //    Prefixed glossary links ([[glossary/x|...]]) must resolve to documents
  //    whose title/path is the unprefixed archive form (x).
  if (!doc) {
    const stripped = stripCategoryPrefix(cleanPath);
    if (stripped !== cleanPath) {
      doc = await prisma.document.findFirst({
        where: { masterId, title: stripped, status: "active" },
        select: { id: true, title: true },
      });
    }
  }

  if (!doc) return null;

  return {
    docId: doc.id,
    title: doc.title,
    anchor: hashPart || undefined,
  };
}
