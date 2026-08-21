import { IFormulaBlock } from "./types";

const FORMULA_BLOCK_RE = /```formula\s*\n([\s\S]*?)```/g;

// имя = выражение  (new style formula)
const ASSIGN_RE = /^(\w[\w_]*)\s*=\s*(.+)$/;
// имя: значение  (legacy name:/expr: pairs, or base input имя: число)
const KEY_VALUE_RE = /^(\w[\w_]*)\s*:\s*(.+)$/;

/**
 * Parses ```formula blocks. One block is a self-contained config that may
 * declare base inputs (имя: число) and formulas in either style:
 *   - new:  name = expr
 *   - legacy: name: X / expr: Y  pairs
 * Each formula block carries the inputs declared in the same fence, so the
 * evaluator can compute derived values from base ones without external data.
 */
export function parseFormulaBlocks(mdText: string): IFormulaBlock[] {
  const blocks: IFormulaBlock[] = [];

  let match: RegExpExecArray | null;
  while ((match = FORMULA_BLOCK_RE.exec(mdText)) !== null) {
    const body = match[1]!;
    const lineOffset = mdText.slice(0, match.index).split("\n").length;

    const inputs: Record<string, number> = {};
    const formulas: Array<{ name: string; expr: string }> = [];
    let pendingName: string | null = null;

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      // new style: name = expr
      const assign = line.match(ASSIGN_RE);
      if (assign) {
        formulas.push({ name: assign[1]!, expr: assign[2]!.trim() });
        continue;
      }

      const kv = line.match(KEY_VALUE_RE);
      if (!kv) continue;
      const key = kv[1]!;
      const value = kv[2]!.trim();

      if (key === "name") {
        pendingName = value;
        continue;
      }
      if (key === "expr" && pendingName) {
        formulas.push({ name: pendingName, expr: value });
        pendingName = null;
        continue;
      }

      // Base input: имя: <number> — feeds the evaluator scope.
      if (value !== "" && Number.isFinite(Number(value))) {
        inputs[key] = Number(value);
      }
    }

    for (const f of formulas) {
      blocks.push({ name: f.name, expr: f.expr, inputs, line: lineOffset });
    }
  }

  return blocks;
}

export function stripFormulaBlocks(mdText: string): string {
  return mdText.replace(FORMULA_BLOCK_RE, "");
}
