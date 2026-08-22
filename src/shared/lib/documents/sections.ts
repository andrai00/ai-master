import GithubSlugger from "github-slugger";
import { extractHeadings, headingSlugText, type IHeadingEntry } from "./headings";

/**
 * Heading text as the rendered TOC sees it: wiki-links collapse to their
 * display text, markdown links to their label, bold/italic stripped, runs of
 * whitespace collapsed. Shared by the read_document tools (TOC + anchor
 * matching) and link-anchor validation so every consumer agrees on what a
 * heading "is".
 */
export function cleanHeading(text: string): string {
  return text
    .replace(/\[\[[^\]|#]+(?:#[^\]]+)?(?:\|([^\]]+))?\]\]/g, (_, display) => (display ? display.trim() : ""))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface IHeadingMatch extends IHeadingEntry {
  /** cleanHeading() result for the matched heading. */
  clean: string;
}

/**
 * Find the heading an anchor points to. Mirrors the UI scroll and link
 * validation: the anchor matches a heading whose cleaned text equals it OR
 * whose rehype-slug (with $var refs and [[wiki links]] stripped) equals the
 * anchor's slug.
 */
function findHeadingByAnchorIn(headings: IHeadingEntry[], anchor: string): IHeadingMatch | null {
  const targetSlug = new GithubSlugger().slug(headingSlugText(anchor));
  for (const h of headings) {
    const clean = cleanHeading(h.text);
    if (!clean) continue;
    if (clean === anchor) return { ...h, clean };
    if (new GithubSlugger().slug(headingSlugText(clean)) === targetSlug) return { ...h, clean };
  }
  return null;
}

export function findHeadingByAnchor(content: string, anchor: string, maxLevel = 6): IHeadingMatch | null {
  return findHeadingByAnchorIn(extractHeadings(content, maxLevel), anchor);
}

export interface ISectionSlice {
  /** The anchor that was matched. */
  anchor: string;
  /** Cleaned heading text of the section (copy it into further calls). */
  heading: string;
  level: number;
  /** Character offset of the section start (heading line) in `content`. */
  start: number;
  /** Character offset of the section end (exclusive) in `content`. */
  end: number;
  /** `content.slice(start, end)` — the section's own text. */
  text: string;
}

/**
 * Slice the section under `anchor`: from the matched heading to the next
 * heading of the same or higher level (deeper subsections are included). Raw
 * `id="anchor"` attributes (archive style) slice to the next top-level heading
 * or end of content. Returns null when the anchor matches nothing.
 */
export function sliceSectionByAnchor(content: string, anchor: string, maxLevel = 6): ISectionSlice | null {
  const headings = extractHeadings(content, maxLevel);

  // Archive-style raw id attribute (id="armor.shield", id="Воровские").
  const idMatch = content.match(new RegExp(`id=["']${escapeRegExp(anchor)}["']`));
  if (idMatch?.index !== undefined) {
    const start = idMatch.index;
    const next = headings.find((h) => h.offset > start && h.level <= 1);
    const end = next ? next.offset : content.length;
    return { anchor, heading: anchor, level: 1, start, end, text: content.slice(start, end) };
  }

  const match = findHeadingByAnchorIn(headings, anchor);
  if (!match) return null;

  const idx = headings.findIndex((h) => h.offset === match.offset);
  let end = content.length;
  for (let i = idx + 1; i < headings.length; i++) {
    if (headings[i].level <= match.level) {
      end = headings[i].offset;
      break;
    }
  }
  return { anchor, heading: match.clean, level: match.level, start: match.offset, end, text: content.slice(match.offset, end) };
}

/**
 * True when `content` contains a raw id="anchor" attribute or a heading the
 * anchor matches. Keeps link validation and the read tools on the same rules.
 */
export function hasAnchor(content: string, anchor: string): boolean {
  if (new RegExp(`id=["']${escapeRegExp(anchor)}["']`).test(content)) return true;
  return findHeadingByAnchor(content, anchor) !== null;
}
