import { CATEGORY_PREFIXES, normalizePath } from "./paths";
import type { getPrisma } from "@/src/shared/lib/db/prisma";

type TPrisma = ReturnType<typeof getPrisma>;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes internal links of a glossary document to the prefixed form
 * ("glossary/...") on read, so the model never sees the unprefixed archive
 * style. Only links that actually resolve to an existing glossary doc are
 * rewritten — external /cdn paths are left untouched.
 */
export async function normalizeReadContent(
  prisma: TPrisma,
  masterId: string,
  category: string,
  content: string
): Promise<string> {
  if (category !== "glossary") return content;

  // Collect unprefixed absolute-path targets: [text](/path.md), [text](/path/)
  const mdRe = /\]\((\/[^)\s]+)\)/g;
  const candidates = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(content)) !== null) {
    const p = normalizePath(m[1]);
    if (p && !CATEGORY_PREFIXES.some((pre) => p.startsWith(pre))) candidates.add(p);
  }

  // Also unprefixed wiki tokens: [[path|label]]
  const wikiRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  while ((m = wikiRe.exec(content)) !== null) {
    const p = normalizePath(m[1]);
    if (p && !CATEGORY_PREFIXES.some((pre) => p.startsWith(pre))) candidates.add(p);
  }

  if (candidates.size === 0) return content;

  const glossPaths = [...candidates].map((p) => `glossary/${p}`);
  const existing = await prisma.document.findMany({
    where: { masterId, path: { in: glossPaths } },
    select: { path: true },
  });
  const existingSet = new Set(existing.map((d) => d.path));

  let out = content;
  for (const p of candidates) {
    if (!existingSet.has(`glossary/${p}`)) continue;
    const re = new RegExp(`\\]\\(\\/${escapeRegExp(p)}(?=\\)|#|/|\\.md|$)`, "g");
    out = out.replace(re, `](/glossary/${p}`);
    const wikiRe = new RegExp(`\\[\\[${escapeRegExp(p)}(?=\\]\\]|\\||$)`, "g");
    out = out.replace(wikiRe, `[[glossary/${p}`);
  }
  return out;
}
