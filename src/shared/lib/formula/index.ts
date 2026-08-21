export { parseFormulaBlocks, stripFormulaBlocks } from "./parser";
export { evaluateFormulas } from "./evaluator";
export type { IFormulaBlock, IFormulaResult, IEvaluationReport, IEvaluationContext } from "./types";

/**
 * Documents in these categories carry real computed values: character sheets
 * (game_visible) and master memory (game_hidden). brain/glossary documents
 * only contain formula EXAMPLES for the agent — they are never evaluated or
 * validated, and the UI shows their formulas raw instead of err badges.
 */
export const FORMULA_CATEGORIES = ["game_hidden", "game_visible"] as const;

export function supportsFormulaCategory(category: string): boolean {
  return (FORMULA_CATEGORIES as readonly string[]).includes(category);
}
