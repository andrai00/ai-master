import { parse, MathNode, SymbolNode } from "mathjs";
import { IFormulaBlock, IFormulaResult, IEvaluationReport } from "./types";

const MAX_EVAL_DEPTH = 50;

function collectDependencies(node: MathNode): string[] {
  const deps = new Set<string>();
  node.traverse((subNode: MathNode) => {
    if (subNode.type === "SymbolNode") {
      deps.add((subNode as unknown as SymbolNode).name);
    }
  });
  return [...deps];
}

/**
 * Evaluates derived formulas. Each formula may reference other formulas and
 * base inputs (declared as имя: число in the same ```formula block). Errors
 * (undefined variable, division by zero, non-finite result, circular
 * reference, parse error) are recorded per formula and CASCADE to formulas
 * that depend on a failed one — the result error is "err".
 */
export function evaluateFormulas(blocks: IFormulaBlock[]): IEvaluationReport {
  const results = new Map<string, IFormulaResult>();
  const errors: string[] = [];

  // Base inputs from all blocks (имя: число).
  const inputs = new Map<string, number>();
  for (const b of blocks) {
    for (const [k, v] of Object.entries(b.inputs)) inputs.set(k, v);
  }

  // Seed every base input into the results map. Bases referenced only in the
  // document BODY ($pm, $spell_slots_1, ...) — not by any formula — would
  // otherwise never appear in results: the UI would render them as "err" and
  // read_document's formulaValues would miss them.
  for (const [k, v] of inputs) {
    results.set(k, { name: k, expr: String(v), value: v, error: null });
  }

  const nameSet = new Set<string>();
  for (const b of blocks) nameSet.add(b.name);
  for (const k of inputs.keys()) nameSet.add(k);

  const parsed = new Map<string, { node: MathNode; deps: string[]; depth: number }>();
  for (const block of blocks) {
    try {
      const node = parse(block.expr);
      const deps = collectDependencies(node).filter((d) => nameSet.has(d));
      parsed.set(block.name, { node, deps, depth: 0 });
      results.set(block.name, { name: block.name, expr: block.expr, value: null, error: null });
    } catch {
      errors.push(`Parse error in "${block.name}": ${block.expr}`);
      results.set(block.name, { name: block.name, expr: block.expr, value: null, error: "Parse error" });
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();

  function fail(name: string, message: string): null {
    const r = results.get(name);
    if (r) r.error = message;
    return null;
  }

  function resolve(name: string): number | null {
    if (visited.has(name)) return results.get(name)?.value ?? null;
    if (visiting.has(name)) {
      errors.push(`Circular reference: "${name}"`);
      return fail(name, "Circular reference");
    }

    // Base input wins over a formula with the same name.
    const input = inputs.get(name);
    if (input !== undefined) {
      results.set(name, { name, expr: String(input), value: input, error: null });
      visited.add(name);
      return input;
    }

    const entry = parsed.get(name);
    if (!entry) {
      errors.push(`Undefined variable: "${name}"`);
      return fail(name, "Undefined variable");
    }

    visiting.add(name);

    if (entry.depth >= MAX_EVAL_DEPTH) {
      errors.push(`Max eval depth exceeded at "${name}"`);
      visiting.delete(name);
      return fail(name, "Max eval depth");
    }

    const scope: Record<string, number> = {};
    for (const dep of entry.deps) {
      const depInput = inputs.get(dep);
      if (depInput !== undefined) {
        scope[dep] = depInput;
        continue;
      }
      const depResult = resolve(dep);
      if (depResult === null) {
        visiting.delete(name);
        return fail(name, `Depends on failed variable "${dep}"`);
      }
      scope[dep] = depResult;
    }

    try {
      const compiled = entry.node.compile();
      const value = compiled.evaluate(scope);

      // Division by zero yields Infinity/NaN — treat as an error.
      if (typeof value !== "number" || !isFinite(value)) {
        errors.push(`"${name}" = ${entry.node.toString()} evaluates to non-finite: ${value}`);
        visiting.delete(name);
        return fail(name, "Non-finite result");
      }

      const result = results.get(name)!;
      result.value = value;
      result.error = null;
      visited.add(name);
      visiting.delete(name);
      return value;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Evaluation error";
      errors.push(`Evaluation error in "${name}": ${entry.node.toString()} (${reason})`);
      visiting.delete(name);
      return fail(name, reason);
    }
  }

  for (const block of blocks) {
    if (parsed.has(block.name)) resolve(block.name);
  }

  return { results, errors };
}
