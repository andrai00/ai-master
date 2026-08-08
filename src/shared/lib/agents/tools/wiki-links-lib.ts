import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
const MD_LINK_RE = /\[(.+?)\]\((https?:\/\/[^)\s]+?|\/[^)\s]+?)\)/g;

export interface IScanResult {
  wikiLinks: number;
  mdLinks: number;
  totalLinks: number;
  matched: number;
  unmatched: number;
  samples: Array<{ link: string; title: string; docId?: string; docTitle?: string }>;
}

export async function scanAllLinks(): Promise<IScanResult> {
  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;
  if (!masterId) throw new Error("errors.noActiveGameTool");

  const prisma = getPrisma();

  const docs = await prisma.document.findMany({
    where: { masterId, category: "glossary", status: "active" },
    select: { id: true, title: true, content: true },
  });

  const titleToId = new Map<string, string>();
  for (const d of docs) {
    titleToId.set(d.title.toLowerCase(), d.id);
  }

  const samples: IScanResult["samples"] = [];
  let wikiCount = 0;
  let mdCount = 0;
  let matched = 0;
  let unmatched = 0;

  for (const doc of docs) {
    // 1. [[wiki-links]]
    for (const m of doc.content.matchAll(WIKI_LINK_RE)) {
      wikiCount++;
      const rawTitle = (m[1] ?? "").trim();
      const existingId = titleToId.get(rawTitle.toLowerCase());
      recordMatch(samples, m[0], rawTitle, existingId);
      if (existingId) matched++; else unmatched++;
    }

    // 2. [text](../path/file.md) or [text](https://...) markdown links
    for (const m of doc.content.matchAll(MD_LINK_RE)) {
      mdCount++;
      const url = (m[2] ?? "").trim();
      const resolved = resolveRelativePath(url);
      if (!resolved) { unmatched++; continue; }

      const existingId = titleToId.get(resolved.toLowerCase());
      recordMatch(samples, m[0], resolved, existingId);
      if (existingId) matched++; else unmatched++;
    }
  }

  return {
    wikiLinks: wikiCount,
    mdLinks: mdCount,
    totalLinks: wikiCount + mdCount,
    matched,
    unmatched,
    samples,
  };
}

function resolveRelativePath(url: string): string {
  let cleaned = url.replace(/\.md$/i, "").split(/[?#]/)[0] ?? "";
  cleaned = cleaned.replace(/^https?:\/\/[^\/]+/, ""); // strip domain for absolute URLs
  cleaned = cleaned.replace(/(^|\/)\.\.\//g, "/");
  cleaned = cleaned.replace(/\/+/g, "/");
  return cleaned.replace(/^\//, "");
}

function extractAnchor(url: string): string {
  const hashIdx = url.indexOf("#");
  return hashIdx === -1 ? "" : url.slice(hashIdx + 1).split(/[?#]/)[0] ?? "";
}

function recordMatch(
  samples: IScanResult["samples"],
  link: string,
  title: string,
  existingId?: string,
) {
  if (samples.length >= 20) return;
  if (existingId) {
    samples.push({ link, title, docId: existingId, docTitle: title });
  } else {
    samples.push({ link, title });
  }
}

export function replaceAllLinks(
  content: string,
  titleToId: Map<string, string>
): { content: string; replaced: number } {
  let replaced = 0;

  // 1. Replace [[wiki-links]]
  content = content.replace(WIKI_LINK_RE, (match, rawTitle, anchor, display) => {
    const title = (rawTitle as string).trim();
    const id = titleToId.get(title.toLowerCase());
    if (!id) return match;
    replaced++;
    let result = id;
    if (anchor) result += `#${(anchor as string).trim()}`;
    if (display) result += `|${(display as string).trim()}`;
    return `[[${result}]]`;
  });

  // 2. Replace [text](../path/file.md) → [[uuid#anchor|text]]
  content = content.replace(MD_LINK_RE, (match, text, url) => {
    const resolved = resolveRelativePath(url as string);
    if (!resolved) return match;
    const id = titleToId.get(resolved.toLowerCase());
    if (!id) return match;
    replaced++;
    const anchor = extractAnchor(url as string);
    const display = (text as string).trim();
    let result = id;
    if (anchor) result += `#${anchor}`;
    if (display) result += `|${display}`;
    return `[[${result}]]`;
  });

  return { content, replaced };
}
