import { parseFormulaBlocks } from "@/src/shared/lib/formula/parser";
import { evaluateFormulas } from "@/src/shared/lib/formula/evaluator";

export interface IFormulaValidation {
  ok: boolean;
  errorCount: number;
  errors: Record<string, string>;
}

/**
 * Validates the ```formula blocks of a document's content: evaluates every
 * formula and reports per-formula errors. Returns null when the content has
 * no formula blocks. Intended to be returned by create/update document tools
 * so the agent sees formula errors right after saving and can fix them.
 */
export function validateFormulaContent(content: string): IFormulaValidation | null {
  const blocks = parseFormulaBlocks(content);
  if (blocks.length === 0) return null;

  const { results } = evaluateFormulas(blocks);
  const errors: Record<string, string> = {};
  results.forEach((v) => {
    if (v.error) errors[v.name] = v.line ? `${v.error} (line ${v.line})` : v.error;
  });
  const errorCount = Object.keys(errors).length;

  return { ok: errorCount === 0, errorCount, errors };
}
