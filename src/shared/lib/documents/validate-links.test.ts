import { describe, it, expect } from "vitest";
import { extractLinkKeys } from "./validate-links";

describe("extractLinkKeys", () => {
  it("collects wiki and archive-style links with their 1-based line", () => {
    const content = [
      "# Doc",
      "",
      "Ссылка [[glossary/spells/98-sleep|Усыпление]] в тексте.",
      "Ещё [[glossary/races/103-goliath]] и [текст](/classes/91-fighter.md).",
    ].join("\n");

    const links = extractLinkKeys(content);
    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({ key: "glossary/spells/98-sleep", line: 3 });
    expect(links[1]).toMatchObject({ key: "glossary/races/103-goliath", line: 4 });
    expect(links[2]).toMatchObject({ key: "classes/91-fighter", line: 4 });
  });

  it("skips external links entirely (no line, no key)", () => {
    const content = [
      "См. [OpenAI](https://openai.com), почта <a@b.c>, [[#anchor]] и [локально](/doc/abc).",
    ].join("\n");
    const links = extractLinkKeys(content);
    // Only /doc/abc resolves to a document; external / mailto / bare # are skipped.
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ key: "abc", line: 1 });
  });

  it("keeps the anchor on wiki links", () => {
    const links = extractLinkKeys("[[glossary/classes/101-sorcerer#Штормовое-колдовство|Текст]]");
    expect(links[0]).toMatchObject({ key: "glossary/classes/101-sorcerer", anchor: "Штормовое-колдовство", line: 1 });
  });
});
