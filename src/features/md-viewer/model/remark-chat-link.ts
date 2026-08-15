import type { Plugin } from "unified";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";

interface ChatLinkNode {
  type: "chatLink";
  key: string;
  children: [];
  data: {
    hName: "span";
    hProperties: Record<string, string>;
  };
}

declare module "mdast" {
  interface StaticPhrasingContentMap {
    chatLink: ChatLinkNode;
  }
}

const CHAT_LINK_RE = /:nav-(game|personal):/g;

export const remarkChatLink: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === undefined) return;
      const pType = (parent as { type: string }).type;
      if (pType === "inlineCode" || pType === "code") return;

      const matches = [...node.value.matchAll(CHAT_LINK_RE)];
      if (matches.length === 0) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children: any[] = [];
      let lastIndex = 0;

      for (const match of matches) {
        if (match.index === undefined) continue;

        if (match.index > lastIndex) {
          children.push({ type: "text", value: node.value.slice(lastIndex, match.index) });
        }

        const key = match[1]!;

        children.push({
          type: "chatLink",
          key,
          children: [],
          data: {
            hName: "span",
            hProperties: {
              "data-chat-link": key,
            },
          },
        });

        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < node.value.length) {
        children.push({ type: "text", value: node.value.slice(lastIndex) });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (parent.children as any).splice(index, 1, ...children);
    });
  };
};
