import { describe, it, expect } from "vitest";
import { extractHeadings, headingSlugText } from "./headings";

describe("extractHeadings", () => {
  it("collects real markdown headings with offsets", () => {
    const content = "# Title\n\nIntro\n\n## Section\n\n### Sub\n";
    const hs = extractHeadings(content);
    expect(hs).toHaveLength(3);
    expect(hs[0]).toEqual({ text: "Title", level: 1, offset: 0 });
    expect(hs[1]).toEqual({ text: "Section", level: 2, offset: 16 });
    expect(hs[2]).toEqual({ text: "Sub", level: 3, offset: 28 });
  });

  it("ignores #-comments inside ```formula blocks", () => {
    const content = [
      "# Лист",
      "",
      "```formula",
      "# Базовые значения (вводит игрок/мастер)",
      "str: 10",
      "```",
      "",
      "## Характеристики",
    ].join("\n");
    const hs = extractHeadings(content);
    expect(hs.map((h) => h.text)).toEqual(["Лист", "Характеристики"]);
  });

  it("collects headings inside ```markdown fences (transparent)", () => {
    const content = "```markdown\n## Изнутри фенса\n```";
    const hs = extractHeadings(content);
    expect(hs.map((h) => h.text)).toEqual(["Изнутри фенса"]);
  });

  it("ignores headings inside other code fences (```js etc.)", () => {
    const content = "```js\n# not a heading\nconst x = 1;\n```\n\n# Real";
    const hs = extractHeadings(content);
    expect(hs.map((h) => h.text)).toEqual(["Real"]);
  });

  it("respects maxLevel", () => {
    const content = "## a\n### b\n#### c";
    expect(extractHeadings(content, 3).map((h) => h.text)).toEqual(["a", "b"]);
  });

  it("preserves underscores in heading text (no emphasis mangling)", () => {
    const hs = extractHeadings("## Метамагия (ед. чародейства: $sorcery_points_max)");
    expect(hs[0]!.text).toBe("Метамагия (ед. чародейства: $sorcery_points_max)");
  });

  it("extracts headings from CRLF content", () => {
    const content = "# Title\r\n\r\n## Штормовое колдовство\r\n\r\n#### Удвоенное заклинание\r\n";
    const hs = extractHeadings(content);
    expect(hs.map((h) => h.text)).toEqual(["Title", "Штормовое колдовство", "Удвоенное заклинание"]);
    expect(hs[1]!.offset).toBe(11);
  });
});

describe("headingSlugText", () => {
  it("strips $var formula refs (empty spans at slug time)", () => {
    expect(headingSlugText("Метамагия (ед. чародейства: $sorcery_points_max)")).toBe("Метамагия (ед. чародейства: )");
  });

  it("strips [[wiki links]] (empty spans at slug time)", () => {
    expect(headingSlugText("Ссылка на [[glossary/spells/98-sleep|Усыпление]]")).toBe("Ссылка на ");
  });

  it("keeps plain text intact", () => {
    expect(headingSlugText("Характеристики")).toBe("Характеристики");
    expect(headingSlugText("КД: 10 + Ловкость")).toBe("КД: 10 + Ловкость");
  });
});
