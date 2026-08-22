import { normalizePath } from "./paths";
import { resolveDocumentRef } from "./resolve-ref";
import { hasAnchor } from "./sections";

type TPrisma = ReturnType<typeof import("@/src/shared/lib/db/prisma").getPrisma>;

export type TDocCategory = "glossary" | "brain" | "game_hidden" | "game_visible";

/**
 * Which target categories a document of a given category may link to.
 * Glossary is always linkable (rules); everything else depends on the source:
 * - glossary → only glossary
 * - brain    → brain + glossary
 * - game_hidden (память мастера) → glossary + hidden + character sheets (visible)
 * - game_visible (листы персонажей) → glossary only
 */
export const LINK_TARGET_RULES: Record<TDocCategory, readonly TDocCategory[]> = {
  glossary: ["glossary"],
  brain: ["brain", "glossary"],
  game_hidden: ["glossary", "game_hidden", "game_visible"],
  game_visible: ["glossary"],
};

export interface ILinkValidation {
  ok: boolean;
  linkCount: number;
  errorCount: number;
  errors: Record<string, string>;
}

interface ILinkRef {
  key: string;
  anchor?: string;
  /** 1-based line of the link in the source content. */
  line?: number;
}

const WIKI_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
const MD_RE = /\]\(([^)\s]+)\)/g;
const DOC_UUID_RE = /^\/doc\/([a-zA-Z0-9-]+)$/;

/** 1-based line of `index` in `content`. */
function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/** Collects unique internal link targets (key + optional #anchor). */
export function extractLinkKeys(content: string): ILinkRef[] {
  const seen = new Set<string>();
  const out: ILinkRef[] = [];
  let m: RegExpExecArray | null;

  const push = (raw: string, index: number, anchor?: string) => {
    const t = raw.trim();
    if (!t) return;
    if (/^(https?:|mailto:|tel:|javascript:|#|data:|\/\/)/.test(t)) return;

    // [text](/doc/<uuid>#anchor) resolves straight to the document id.
    const docMatch = t.match(DOC_UUID_RE);
    if (docMatch) {
      const key = docMatch[1]!;
      const id = `${key}#${anchor ?? ""}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ key, anchor, line: lineAt(content, index) });
      }
      return;
    }

    const norm = normalizePath(t);
    if (!norm) return;
    const id = `${norm}#${anchor ?? ""}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push({ key: norm, anchor, line: lineAt(content, index) });
    }
  };

  WIKI_RE.lastIndex = 0;
  while ((m = WIKI_RE.exec(content)) !== null) {
    push(m[1]!, m.index, m[2] || undefined);
  }

  MD_RE.lastIndex = 0;
  while ((m = MD_RE.exec(content)) !== null) {
    const [pathPart, hashPart] = m[1]!.split("#");
    push(pathPart, m.index, hashPart || undefined);
  }

  return out;
}

/**
 * True when the target content contains an anchor: either an exact
 * id="..." attribute (archive style: id="armor.shield", id="Воровские") or a
 * heading whose cleaned text / slug matches the anchor. Mirrors the UI, which
 * scrolls to the slugged heading OR the raw [id="anchor"] attribute.
 * Shared with the read_document tools — see ./sections.
 */

/**
 * Validates the internal links of a document: every link must resolve to an
 * existing document, the target category must be allowed for the source
 * category, and a #anchor must match a heading of the target document.
 * Returns null when the content has no internal links. Intended to be
 * returned by create/update document tools (parallel to formulaValidation)
 * and used by the standalone validate_links tool.
 */
export async function validateLinksContent(
  prisma: TPrisma,
  masterId: string,
  sourceCategory: string,
  content: string
): Promise<ILinkValidation | null> {
  const links = extractLinkKeys(content);
  if (links.length === 0) return null;

  const allowed = LINK_TARGET_RULES[sourceCategory as TDocCategory] ?? null;
  const errors: Record<string, string> = {};
  const contentCache = new Map<string, string | null>();

  for (const link of links) {
    const label = link.anchor ? `${link.key}#${link.anchor}` : link.key;
    const where = link.line ? ` (line ${link.line})` : "";
    const ref = await resolveDocumentRef(prisma, masterId, link.key);
    if (!ref) {
      errors[label] = `target-not-found${where}`;
      continue;
    }
    if (allowed && !allowed.includes(ref.category as TDocCategory)) {
      errors[label] = `target-category-not-allowed (${ref.category})${where}`;
      continue;
    }
    if (link.anchor) {
      if (!contentCache.has(ref.id)) {
        const target = await prisma.document.findUnique({
          where: { id: ref.id },
          select: { content: true },
        });
        contentCache.set(ref.id, target?.content ?? null);
      }
      const targetContent = contentCache.get(ref.id);
      if (targetContent == null || !hasAnchor(targetContent, link.anchor)) {
        errors[label] = `anchor-not-found${where}`;
      }
    }
  }

  const errorCount = Object.keys(errors).length;
  return { ok: errorCount === 0, linkCount: links.length, errorCount, errors };
}
