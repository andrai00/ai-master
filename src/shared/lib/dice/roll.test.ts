import { describe, it, expect } from "vitest";
import { rollDice, formatRollDetail } from "./roll";

describe("rollDice breakdown", () => {
  it("labels the pure die value next to a simple roll with modifier", () => {
    const r = rollDice("1d20+6");
    expect(r.output).toMatch(/^1d20\+6: \[\d+\]\+6 = \d+$/);
    const die = Number(r.breakdown.match(/кости: (\d+)/)?.[1]);
    expect(die).toBeGreaterThanOrEqual(1);
    expect(die + 6).toBe(r.totals[0]);
  });

  it("flattens every die of a compound expression", () => {
    const r = rollDice("2d20+1d6");
    const dies = (r.breakdown.match(/кости: ([^·]+)/)?.[1] ?? "").split(",").map(s => Number(s.trim()));
    expect(dies).toHaveLength(3);
    expect(dies.reduce((a, b) => a + b, 0)).toBe(r.totals[0]);
  });

  it("lists all rolled dice even with keep/drop", () => {
    const r = rollDice("4d6kh3");
    const dies = (r.breakdown.match(/кости: ([^·]+)/)?.[1] ?? "").split(",").map(s => Number(s.trim()));
    expect(dies).toHaveLength(4);
    const expected = [...dies].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
    expect(expected).toBe(r.totals[0]);
  });

  it("strips explode/reroll markers but keeps the values", () => {
    const explode = rollDice("4d6!");
    expect((explode.breakdown.match(/кости: ([^·]+)/)?.[1] ?? "").split(",").length).toBeGreaterThanOrEqual(4);
    const reroll = rollDice("4d6ro<2");
    expect(reroll.breakdown).toMatch(/кости: /);
    expect(reroll.breakdown).not.toContain("ro");
  });

  it("keeps the formula and appends the breakdown in the detail", () => {
    const r = rollDice("1d8-1");
    const detail = formatRollDetail(r);
    expect(detail).toContain("1d8-1: [");
    expect(detail).toContain("кости:");
  });
});
