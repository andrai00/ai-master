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

  it("marks circular references as error", () => {
    const { results } = evalBlock("```formula\na = b + 1\nb = a + 1\n```");
    expect(results.get("a")!.error).toBeTruthy();
    expect(results.get("b")!.error).toBeTruthy();
  });
});
