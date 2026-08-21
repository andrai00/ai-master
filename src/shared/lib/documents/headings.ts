// Fence-aware markdown heading extraction shared by the UI TOC, the agent's
// read_document TOC and link-anchor validation. Headings inside ```code fences
// are NOT real headings — e.g. #-comment lines of a ```formula block must not
// appear in a table of contents. ```markdown / ```md fences are treated as
// transparent (their content is rendered as markdown and its headings are real).

export interface IHeadingEntry {
  /** Heading text without the leading '#'s, trimmed. */
  text: string;
  level: number;
  /** 1-based offset of the heading line start in `content` (0-based index). */
  offset: number;
}

export function extractHeadings(content: string, maxLevel = 6): IHeadingEntry[] {
  const out: IHeadingEntry[] = [];
  const lines = content.split("\n");
  let offset = 0;
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      // ```markdown / ```md fences are unwrapped by the viewer — their content
      // flows as real markdown, so keep collecting headings inside them.
      if (!/^```\s*(markdown|md)\s*$/i.test(trimmed)) inFence = !inFence;
      offset += line.length + 1;
      continue;
    }

    if (!inFence) {
      const m = line.match(/^(#{1,6})\s+(.+)$/);
      if (m && m[1]!.length <= maxLevel) {
        out.push({ text: m[2]!.trim(), level: m[1]!.length, offset });
      }
    }

    offset += line.length + 1;
  }

  return out;
}

/**
 * Text that rehype-slug actually sees when it generates the heading id: at
 * slug time the `$var` formula refs and `[[wiki links]]` are already AST
 * elements with EMPTY children (their React components fill in text later),
 * so they contribute nothing to the slug. Stripping them lets the TOC and
 * #anchor lookups produce ids that match the rendered DOM.
 */
export function headingSlugText(text: string): string {
  return text.replace(/\[\[[^\]]*\]\]|\$\w[\w_]*/g, "");
}
