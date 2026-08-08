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

    // 2. [text](/relative/path) markdown links
    for (const m of doc.content.matchAll(MD_LINK_RE)) {
      mdCount++;
      const url = (m[2] ?? "").trim();
      const lastSlug = extractLastPathSegment(url);
      if (!lastSlug) { unmatched++; continue; }

      const existingId = titleToId.get(lastSlug.toLowerCase());
      recordMatch(samples, m[0], lastSlug, existingId);
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

function extractLastPathSegment(url: string): string {
  const stripped = url.replace(/\/$/, "").split(/[?#]/)[0]?.replace(/\/$/, "") ?? "";
  const idx = stripped.lastIndexOf("/");
  if (idx === -1) return "";
  return stripped.slice(idx + 1);
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

  // 2. Replace [text](/relative/path) → [[uuid|text]]
  content = content.replace(MD_LINK_RE, (match, text, url) => {
    const lastSlug = extractLastPathSegment(url as string);
    if (!lastSlug) return match;
    const id = titleToId.get(lastSlug.toLowerCase());
    if (!id) return match;
    replaced++;
    const display = (text as string).trim();
    return display ? `[[${id}|${display}]]` : `[[${id}]]`;
  });

  return { content, replaced };
}
