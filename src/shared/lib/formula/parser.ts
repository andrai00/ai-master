import { IFormulaBlock } from "./types";

const FORMULA_BLOCK_RE = /```formula\s*\n([\s\S]*?)```/g;

const YAML_KEY_VALUE_RE = /^(\w[\w_]*)\s*:\s*(.+)$/;

export function parseFormulaBlocks(mdText: string): IFormulaBlock[] {
  const blocks: IFormulaBlock[] = [];

  let match: RegExpExecArray | null;
  while ((match = FORMULA_BLOCK_RE.exec(mdText)) !== null) {
    const body = match[1]!;
    const lineOffset = mdText.slice(0, match.index).split("\n").length;

    const props: Record<string, string> = {};
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const kv = trimmed.match(YAML_KEY_VALUE_RE);
      if (kv) {
        props[kv[1]!] = kv[2]!.trim();
      }
    }

    if (props["name"] && props["expr"]) {
      blocks.push({
        name: props["name"],
        expr: props["expr"],
        line: lineOffset,
      });
    }
  }

  return blocks;
}

export function stripFormulaBlocks(mdText: string): string {
  return mdText.replace(FORMULA_BLOCK_RE, "");
}
