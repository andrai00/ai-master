import type { Plugin } from "unified";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";

interface WikiLinkNode {
  type: "wikiLink";
  docId: string;
  anchor: string | null;
  displayText: string | null;
  children: [];
  data: {
    hName: "span";
    hProperties: Record<string, string>;
  };
}

declare module "mdast" {
  interface StaticPhrasingContentMap {
    wikiLink: WikiLinkNode;
  }
}

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

/**
 * remark plugin that parses [[doc-id]] and [[doc-id#heading]] syntax
 * into custom wikiLink nodes. Does NOT parse inside code blocks.
 */
export const remarkWikiLink: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === undefined) return;
      const pType = (parent as { type: string }).type;
      if (pType === "inlineCode" || pType === "code") return;

      const matches = [...node.value.matchAll(WIKI_LINK_RE)];
      if (matches.length === 0) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children: any[] = [];
      let lastIndex = 0;

      for (const match of matches) {
        if (match.index === undefined) continue;

        // text before the link
        if (match.index > lastIndex) {
          children.push({ type: "text", value: node.value.slice(lastIndex, match.index) });
        }

        const docId = match[1]!.trim();
        const anchor = match[2]?.trim() || null;
        const displayText = match[3]?.trim() || null;

        const hProperties: Record<string, string> = {
          "data-wiki-link": docId + (anchor ? `|${anchor}` : ""),
        };
        if (displayText) {
          hProperties["data-wiki-display"] = displayText;
        }

        children.push({
          type: "wikiLink",
          docId,
          anchor,
          displayText,
          children: [],
          data: {
            hName: "span",
            hProperties,
          },
        });

        lastIndex = match.index + match[0].length;
      }

      // remaining text after last link
      if (lastIndex < node.value.length) {
        children.push({ type: "text", value: node.value.slice(lastIndex) });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (parent.children as any).splice(index, 1, ...children);
    });
  };
};
