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

export function evaluateFormulas(blocks: IFormulaBlock[]): IEvaluationReport {
  const results = new Map<string, IFormulaResult>();
  const errors: string[] = [];

  const parsed = new Map<string, { node: MathNode; deps: string[]; depth: number }>();
  const nameSet = new Set(blocks.map((b) => b.name));

  for (const block of blocks) {
    try {
      const node = parse(block.expr);
      const deps = collectDependencies(node).filter((d) => nameSet.has(d));
      parsed.set(block.name, { node, deps, depth: 0 });
      results.set(block.name, {
        name: block.name,
        expr: block.expr,
        value: null,
        error: null,
      });
    } catch {
      errors.push(`Parse error in "${block.name}": ${block.expr}`);
      results.set(block.name, {
        name: block.name,
        expr: block.expr,
        value: null,
        error: "Parse error",
      });
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();

  function resolve(name: string): number | null {
    if (visited.has(name)) {
      const cached = results.get(name);
      return cached?.value ?? null;
    }

    if (visiting.has(name)) {
      errors.push(`Circular reference detected: "${name}"`);
      return null;
    }

    const entry = parsed.get(name);
    if (!entry) return null;

    visiting.add(name);

    if (entry.depth >= MAX_EVAL_DEPTH) {
      errors.push(`Max eval depth exceeded at "${name}"`);
      visiting.delete(name);
      return null;
    }

    const scope: Record<string, number> = {};

    for (const dep of entry.deps) {
      const depResult = resolve(dep);
      if (depResult !== null) {
        scope[dep] = depResult;
      } else {
        visiting.delete(name);
        return null;
      }
    }

    try {
      const compiled = entry.node.compile();
      const value = compiled.evaluate(scope);

      if (typeof value !== "number" || !isFinite(value)) {
        errors.push(`"${name}" = ${entry.node.toString()} evaluates to non-finite: ${value}`);
        visiting.delete(name);
        return null;
      }

      const result = results.get(name)!;
      result.value = value;
      result.error = null;

      visited.add(name);
      visiting.delete(name);
      return value;
    } catch {
      errors.push(`Evaluation error in "${name}": ${entry.node.toString()}`);
      visiting.delete(name);
      return null;
    }
  }

  for (const block of blocks) {
    if (parsed.has(block.name)) {
      resolve(block.name);
    }
  }

  return { results, errors };
}
