import { describe, it, expect } from "vitest";
import { normalizePath, makePath, replacePathLinks } from "./paths";

describe("normalizePath", () => {
  it("strips leading/trailing slashes and .md", () => {
    expect(normalizePath("/bestiary/331-camel.md")).toBe("bestiary/331-camel");
    expect(normalizePath("/spells/149-ray_of_frost/")).toBe("spells/149-ray_of_frost");
    expect(normalizePath("rules/mechanics/158-movement_and_position.md#anchor")).toBe(
      "rules/mechanics/158-movement_and_position"
    );
  });
});

describe("makePath", () => {
  it("prefixes the category", () => {
    expect(makePath("brain", "routing/main-router")).toBe("brain/routing/main-router");
    expect(makePath("glossary", "bestiary/331-camel")).toBe("glossary/bestiary/331-camel");
    expect(makePath("game_visible", "sheet-valera", "player1")).toBe("visible/player1/sheet-valera");
  });

  it("scopes game_hidden notes with playerId under hidden/players/<id>/", () => {
    expect(makePath("game_hidden", "Создание персонажа: Кирилл", "p1")).toBe(
      "hidden/players/p1/Создание персонажа: Кирилл"
    );
    expect(makePath("game_hidden", "hidden/players/p1/Создание персонажа: Кирилл", "p1")).toBe(
      "hidden/players/p1/Создание персонажа: Кирилл"
    );
  });

  it("keeps game_hidden without playerId unprefixed", () => {
    expect(makePath("game_hidden", "memory/scene-3")).toBe("hidden/memory/scene-3");
  });
});

describe("replacePathLinks (rename cascade)", () => {
  it("updates both the wiki and the archive link forms", () => {
    const content =
      "[[glossary/папка/пример_документа|label]] и [text](/папка/пример_документа.md) и [[папка/пример_документа]]";
    const out = replacePathLinks(content, "glossary/папка/пример_документа", "glossary/папка/новое_имя");
    expect(out).toContain("[[glossary/папка/новое_имя|label]]");
    expect(out).toContain("](/папка/новое_имя.md)");
    expect(out).toContain("[[папка/новое_имя]]");
    expect(out).not.toContain("пример_документа");
  });

  it("does NOT touch similar names (пример_ссылки_2)", () => {
    const content = "[[glossary/папка/пример_ссылки]] и [[glossary/папка/пример_ссылки_2]] и [x](/папка/пример_ссылки_2.md)";
    const out = replacePathLinks(content, "glossary/папка/пример_ссылки", "glossary/папка/новое");
    expect(out).toContain("[[glossary/папка/новое]]");
    expect(out).toContain("[[glossary/папка/пример_ссылки_2]]");
    expect(out).toContain("](/папка/пример_ссылки_2.md)");
  });
});
