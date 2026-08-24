import GithubSlugger from "github-slugger";
import { extractHeadings, headingSlugText, type IHeadingEntry } from "./headings";
import { splitLines, lineNumberAt } from "./line-utils";

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

export interface ISectionLineEntry {
  /** Cleaned heading text (copy into `anchor` or display). */
  heading: string;
  level: number;
  /** Character offset of the heading line start in `content`. */
  offset: number;
  /** 1-based first line of the section (the heading line itself). */
  startLine: number;
  /** 1-based last line of the section (exclusive of the next same-level heading). */
  endLine: number;
  /** Number of lines the section spans: endLine - startLine + 1. */
  lineCount: number;
}

/**
 * Table of contents with LINE RANGES. For every heading — the 1-based line
 * span its section occupies ([startLine..endLine], the same rule as
 * sliceSectionByAnchor) and the line count. The agent uses these numbers to
 * jump straight to a section via read_lines(id, startLine, endLine) instead of
 * pulling the whole document. Line numbers match numberLines / readLineRange.
 */
export function buildLineToc(content: string, maxLevel = 6): ISectionLineEntry[] {
  const headings = extractHeadings(content, maxLevel);
  if (headings.length === 0) return [];
  const totalLines = splitLines(content).length;
  return headings.map((h, i) => {
    const startLine = lineNumberAt(content, h.offset);
    let endLine = totalLines;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        endLine = lineNumberAt(content, headings[j].offset) - 1;
        break;
      }
    }
    if (endLine < startLine) endLine = startLine;
    return {
      heading: cleanHeading(h.text),
      level: h.level,
      offset: h.offset,
      startLine,
      endLine,
      lineCount: endLine - startLine + 1,
    };
  });
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
