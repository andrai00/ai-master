import { describe, it, expect } from "vitest";
import { cleanHeading, findHeadingByAnchor, hasAnchor, sliceSectionByAnchor, buildLineToc } from "./sections";

const content = [
  "# Лист класса",
  "",
  "## Штормовое колдовство",
  "Текст про штормовое колдовство.",
  "",
  "### Удвоенное заклинание",
  "Детали удвоения.",
  "",
  "## На больших уровнях",
  "Текст про уровни.",
].join("\n");

describe("cleanHeading", () => {
  it("collapses wiki links to their display text", () => {
    expect(cleanHeading("Ссылка на [[glossary/spells/98-sleep|Усыпление]]")).toBe("Ссылка на Усыпление");
  });

  it("strips markdown links, emphasis and collapses whitespace", () => {
    expect(cleanHeading("**Раздел** [см. тут](/x.md)  про  бой")).toBe("Раздел см. тут про бой");
  });
});

describe("sliceSectionByAnchor", () => {
  it("slices a top-level section to the next heading of the same level", () => {
    const slice = sliceSectionByAnchor(content, "Штормовое колдовство");
    expect(slice).not.toBeNull();
    expect(slice!.level).toBe(2);
    expect(slice!.heading).toBe("Штормовое колдовство");
    expect(slice!.text).toContain("Текст про штормовое колдовство");
    expect(slice!.text).toContain("Детали удвоения");
    expect(slice!.text).not.toContain("На больших уровнях");
    expect(slice!.text).not.toContain("Текст про уровни");
  });

  it("slices a subsection without pulling the following sibling or the parent", () => {
    const slice = sliceSectionByAnchor(content, "Удвоенное заклинание");
    expect(slice!.level).toBe(3);
    expect(slice!.text).toContain("Детали удвоения");
    expect(slice!.text).not.toContain("Текст про штормовое колдовство");
  });

  it("matches by slug (dash-cased, case-insensitive)", () => {
    const slice = sliceSectionByAnchor(content, "штормовое-колдовство");
    expect(slice).not.toBeNull();
    expect(slice!.heading).toBe("Штормовое колдовство");
  });

  it("returns null for a missing anchor", () => {
    expect(sliceSectionByAnchor(content, "Нет такого раздела")).toBeNull();
  });

  it("matches raw id= attributes (archive style)", () => {
    const c = '## X\n<div id="armor.shield">Броня</div>\n\n# Дальше';
    const slice = sliceSectionByAnchor(c, "armor.shield");
    expect(slice).not.toBeNull();
    expect(slice!.text).toContain("Броня");
  });

  it("matches headings that contain wiki links", () => {
    const c = "## Ссылка на [[glossary/spells/98-sleep|Усыпление]]\nконтент";
    const slice = sliceSectionByAnchor(c, "Ссылка на Усыпление");
    expect(slice).not.toBeNull();
    expect(slice!.text).toContain("контент");
  });

  it("slices to the end of content for the last section", () => {
    const slice = sliceSectionByAnchor(content, "На больших уровнях");
    expect(slice!.text).toContain("Текст про уровни");
  });
});

describe("findHeadingByAnchor", () => {
  it("returns the matching heading entry with clean text", () => {
    const h = findHeadingByAnchor(content, "Штормовое колдовство");
    expect(h).toMatchObject({ level: 2, clean: "Штормовое колдовство" });
  });
});

describe("buildLineToc", () => {
  const tocContent = [
    "# Заголовок 1",
    "строка A",
    "",
    "## Подраздел",
    "строка B",
    "",
    "# Заголовок 2",
    "строка C",
  ].join("\n");

  it("assigns each section its exact 1-based line range", () => {
    const toc = buildLineToc(tocContent);
    expect(toc).toEqual([
      { heading: "Заголовок 1", level: 1, offset: 0, startLine: 1, endLine: 6, lineCount: 6 },
      { heading: "Подраздел", level: 2, offset: 24, startLine: 4, endLine: 6, lineCount: 3 },
      { heading: "Заголовок 2", level: 1, offset: 47, startLine: 7, endLine: 8, lineCount: 2 },
    ]);
  });

  it("slices the last section to the end of the document", () => {
    const toc = buildLineToc("# A\nx\n## B\ny");
    expect(toc[1]).toMatchObject({ heading: "B", startLine: 3, endLine: 4, lineCount: 2 });
  });

  it("returns an empty array for a document without headings", () => {
    expect(buildLineToc("просто текст\nбез заголовков")).toEqual([]);
  });

  it("ignores headings inside formula fences", () => {
    const c = "# Настоящий\n```formula\n# не заголовок\nx = 1\n```\n## Следующий";
    const toc = buildLineToc(c);
    expect(toc.map((t) => t.heading)).toEqual(["Настоящий", "Следующий"]);
  });

  it("respects maxLevel", () => {
    const c = "# A\n## B\n### C";
    expect(buildLineToc(c, 2).map((t) => t.heading)).toEqual(["A", "B"]);
  });

  it("start lines match the heading positions and ranges are monotonic", () => {
    const toc = buildLineToc(tocContent);
    expect(toc[0].startLine).toBe(1);
    expect(toc[1].startLine).toBeGreaterThan(toc[0].startLine);
    expect(toc[2].startLine).toBeGreaterThan(toc[1].endLine);
    expect(toc[2].endLine).toBe(8);
  });
});

describe("hasAnchor", () => {
  it("rejects unmatched anchors", () => {
    expect(hasAnchor("# A\n## B", "C")).toBe(false);
  });

  it("accepts heading and raw id anchors", () => {
    expect(hasAnchor("# A\n## B", "B")).toBe(true);
    expect(hasAnchor('<div id="x">', "x")).toBe(true);
  });
});
