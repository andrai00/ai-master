import { normalizePath } from "./paths";
import { resolveDocumentRef } from "./resolve-ref";

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

const WIKI_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
const MD_RE = /\]\(([^)\s]+)\)/g;
const DOC_UUID_RE = /^\/doc\/([a-zA-Z0-9-]+)$/;

/** Collects unique internal link targets, skipping external URLs and #anchors. */
export function extractLinkKeys(content: string): string[] {
  const keys = new Set<string>();
  let m: RegExpExecArray | null;

  const push = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (/^(https?:|mailto:|tel:|javascript:|#|data:|\/\/)/.test(t)) return;

    // [text](/doc/<uuid>) resolves straight to the document id.
    const docMatch = t.match(DOC_UUID_RE);
    if (docMatch) {
      keys.add(docMatch[1]!);
      return;
    }

    const norm = normalizePath(t);
    if (norm) keys.add(norm);
  };

  WIKI_RE.lastIndex = 0;
  while ((m = WIKI_RE.exec(content)) !== null) push(m[1]!);

  MD_RE.lastIndex = 0;
  while ((m = MD_RE.exec(content)) !== null) push(m[1]!);

  return [...keys];
}

/**
 * Validates the internal links of a document: every link must resolve to an
 * existing document and the target category must be allowed for the source
 * category. Returns null when the content has no internal links. Intended to
 * be returned by create/update document tools (parallel to formulaValidation)
 * and used by the standalone validate_links tool.
 */
export async function validateLinksContent(
  prisma: TPrisma,
  masterId: string,
  sourceCategory: string,
  content: string
): Promise<ILinkValidation | null> {
  const keys = extractLinkKeys(content);
  if (keys.length === 0) return null;

  const allowed = LINK_TARGET_RULES[sourceCategory as TDocCategory] ?? null;
  const errors: Record<string, string> = {};

  for (const key of keys) {
    const ref = await resolveDocumentRef(prisma, masterId, key);
    if (!ref) {
      errors[key] = "target-not-found";
      continue;
    }
    if (allowed && !allowed.includes(ref.category as TDocCategory)) {
      errors[key] = `target-category-not-allowed (${ref.category})`;
    }
  }

  const errorCount = Object.keys(errors).length;
  return { ok: errorCount === 0, linkCount: keys.length, errorCount, errors };
}
