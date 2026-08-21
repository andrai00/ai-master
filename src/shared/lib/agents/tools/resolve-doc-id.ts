import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { CATEGORY_PREFIXES, normalizePath } from "@/src/shared/lib/documents/paths";

export async function resolveDocId(idOrPath: string): Promise<string | null> {
  if (!(idOrPath.includes("/") || idOrPath.endsWith(".md"))) return idOrPath;

  const cleanPath = normalizePath(idOrPath);
  if (!cleanPath) return null;

  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;

  const where: Record<string, unknown> = { status: "active" };
  if (masterId) where.masterId = masterId;

  // 1) Exact path match.
  let doc = await prisma.document.findFirst({
    where: { ...where, path: cleanPath },
    select: { id: true },
  });
  // 2) Archive-internal links have no prefix — try glossary/.
  if (!doc && masterId && !CATEGORY_PREFIXES.some((p) => cleanPath.startsWith(p))) {
    doc = await prisma.document.findFirst({
      where: { ...where, path: `glossary/${cleanPath}` },
      select: { id: true },
    });
  }
  // 3) Title fallback for pre-path documents.
  if (!doc) {
    doc = await prisma.document.findFirst({
      where: { ...where, title: cleanPath },
      select: { id: true },
    });
  }

  return doc?.id ?? null;
}
