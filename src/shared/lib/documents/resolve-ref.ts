import { CATEGORY_PREFIXES, normalizePath, stripCategoryPrefix } from "./paths";

type TPrisma = ReturnType<typeof import("@/src/shared/lib/db/prisma").getPrisma>;

export interface IResolvedRef {
  id: string;
  category: string;
}

/**
 * Shared server-side resolver for a document reference (id, path or title).
 *
 * Links are written in many forms and this resolver must accept them all:
 * - UUID:  "0e2c7de7-..."              → by id
 * - path:  "glossary/bestiary/331-camel" or "bestiary/331-camel"
 * - title: "races/217-plasmoid" / "Бой D&D 5e"
 * - prefixed glossary link: "glossary/races/217-plasmoid" → matches title "races/217-plasmoid"
 * - archive markdown: "/bestiary/18-commoner.md"
 *
 * Category prefix is optional for glossary links and is stripped when
 * matching titles, so [[glossary/x]] and [[x]] resolve identically.
 */
export async function resolveDocumentRef(
  prisma: TPrisma,
  masterId: string,
  key: string
): Promise<IResolvedRef | null> {
  const clean = key.trim();
  if (!clean) return null;

  // 0) Direct UUID match (also covers bare titles that happen to have no slash).
  if (!clean.includes("/") && !clean.endsWith(".md")) {
    const byId = await prisma.document.findFirst({
      where: { id: clean, masterId, status: "active" },
      select: { id: true, category: true },
    });
    if (byId) return byId;
  }

  const cleanPath = normalizePath(clean);
  if (!cleanPath) return null;

  // 1) Exact path match.
  let doc = await prisma.document.findFirst({
    where: { masterId, path: cleanPath, status: "active" },
    select: { id: true, category: true },
  });

  // 2) Archive-internal links have no category prefix ("bestiary/331-camel") —
  //    try the glossary path first.
  if (!doc && !CATEGORY_PREFIXES.some((p) => cleanPath.startsWith(p))) {
    doc = await prisma.document.findFirst({
      where: { masterId, path: `glossary/${cleanPath}`, status: "active" },
      select: { id: true, category: true },
    });
  }

  // 3) Legacy fallback by exact title (documents whose path predates the backfill).
  if (!doc) {
    doc = await prisma.document.findFirst({
      where: { masterId, title: cleanPath, status: "active" },
      select: { id: true, category: true },
    });
  }

  // 4) Title match with the category prefix stripped ("glossary/x" -> title "x").
  if (!doc) {
    const stripped = stripCategoryPrefix(cleanPath);
    if (stripped !== cleanPath) {
      doc = await prisma.document.findFirst({
        where: { masterId, title: stripped, status: "active" },
        select: { id: true, category: true },
      });
    }
  }

  return doc;
}
