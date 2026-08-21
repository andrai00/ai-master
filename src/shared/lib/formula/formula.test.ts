import { describe, it, expect } from "vitest";
import { parseFormulaBlocks } from "./parser";
import { evaluateFormulas } from "./evaluator";

describe("parseFormulaBlocks", () => {
  it("parses base inputs and new-style formulas from one block", () => {
    const md =
      "```formula\nstr: 16\ndex: 17\nlevel: 1\n\nstr_mod = floor((str-10)/2)\ndex_mod = floor((dex-10)/2)\n```";
    const blocks = parseFormulaBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.name).toBe("str_mod");
    expect(blocks[0]!.expr).toBe("floor((str-10)/2)");
    expect(blocks[0]!.inputs).toEqual({ str: 16, dex: 17, level: 1 });
  });

  it("still parses legacy name:/expr: pairs", () => {
    const md = "```formula\nname: ac\nexpr: base_ac + shield_bonus + dex_mod\nbase_ac: 14\nshield_bonus: 2\n```";
    const blocks = parseFormulaBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("ac");
    expect(blocks[0]!.inputs).toEqual({ base_ac: 14, shield_bonus: 2 });
  });

  it("ignores comments and blank lines", () => {
    const md = "```formula\n# comment\n\nstr: 16\nfoo = 1 + 1\n```";
    const blocks = parseFormulaBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("foo");
  });
});

describe("evaluateFormulas", () => {
  const evalBlock = (md: string) => evaluateFormulas(parseFormulaBlocks(md));

  it("computes derived values from inputs and other formulas", () => {
    const { results, errors } = evalBlock(
      "```formula\nstr: 16\nbase_ac: 14\nshield_bonus: 2\ndex: 17\n\nstr_mod = floor((str-10)/2)\ndex_mod = floor((dex-10)/2)\nac = base_ac + shield_bonus + dex_mod\n```"
    );
    expect(errors).toEqual([]);
    expect(results.get("str_mod")!.value).toBe(3);
    expect(results.get("dex_mod")!.value).toBe(3);
    expect(results.get("ac")!.value).toBe(19);
  });

  it("resolves values regardless of declaration order", () => {
    const { results, errors } = evalBlock("```formula\na = b + 1\nb = 1\n```");
    expect(errors).toEqual([]);
    expect(results.get("a")!.value).toBe(2);
  });

  it("marks division by zero as error and cascades to dependents", () => {
    const { results } = evalBlock("```formula\nfoo = 1/0\nbar = foo + 5\n```");
    expect(results.get("foo")!.error).toBeTruthy();
    expect(results.get("foo")!.value).toBeNull();
    expect(results.get("bar")!.error).toBeTruthy();
    expect(results.get("bar")!.value).toBeNull();
  });

  it("marks undefined variables as error", () => {
    const { results } = evalBlock("```formula\nfoo = str + 1\n```");
    expect(results.get("foo")!.error).toBeTruthy();
    expect(results.get("foo")!.value).toBeNull();
  });

  it("reports the 1-based line of the formula block with the error", () => {
    const md = "header line\n\n```formula\nfoo = str + 1\n```";
    const { results } = evaluateFormulas(parseFormulaBlocks(md));
    expect(results.get("foo")!.line).toBe(3);
    expect(results.get("foo")!.error).toBeTruthy();
  });

  it("marks circular references as error", () => {
    const { results } = evalBlock("```formula\na = b + 1\nb = a + 1\n```");
    expect(results.get("a")!.error).toBeTruthy();
    expect(results.get("b")!.error).toBeTruthy();
  });

  it("includes base inputs in results so $base refs resolve in the UI", () => {
    const { results, errors } = evalBlock(
      "```formula\npm: 0\nzm: 140\nsm: 0\nmm: 0\nspell_slots_1: 4\nspell_slots_2: 2\n\nmoney_total_gm = pm*10 + zm + sm*0.1 + mm*0.01\n```"
    );
    expect(errors).toEqual([]);
    // Bases referenced ONLY in the body (not by any formula) must still be
    // present — otherwise the UI renders $pm/$spell_slots_1 as "err" and
    // read_document misses them in formulaValues.
    expect(results.get("pm")!.value).toBe(0);
    expect(results.get("zm")!.value).toBe(140);
    expect(results.get("sm")!.value).toBe(0);
    expect(results.get("mm")!.value).toBe(0);
    expect(results.get("spell_slots_1")!.value).toBe(4);
    expect(results.get("spell_slots_2")!.value).toBe(2);
    expect(results.get("money_total_gm")!.value).toBe(140);
  });

  it("does not double-count bases that share a name with a formula", () => {
    // Base input wins over a formula with the same name (evaluator contract).
    const { results } = evalBlock("```formula\nac: 10\nac = ac + 1\n```");
    expect(results.get("ac")!.value).toBe(10);
    expect(results.get("ac")!.error).toBeNull();
  });
});
