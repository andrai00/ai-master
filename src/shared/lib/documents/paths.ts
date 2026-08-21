// Shared path helpers for the unique-paths model.

export const CATEGORY_PREFIXES = ["glossary/", "brain/", "hidden/", "visible/"] as const;

export function hasCategoryPrefix(path: string): boolean {
  return CATEGORY_PREFIXES.some((p) => path.startsWith(p));
}

/** Strips .md, leading/trailing slashes and #anchor from a link target. */
export function normalizePath(value: string): string {
  const [pathPart] = value.split("#");
  return (pathPart ?? "")
    .replace(/\.md$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .trim();
}

/** Category prefix for a document category ("glossary" -> "glossary/"). */
export function categoryPrefix(category: string): string {
  switch (category) {
    case "brain":
      return "brain/";
    case "game_hidden":
      return "hidden/";
    case "game_visible":
      return "visible/";
    default:
      return "glossary/";
  }
}

/**
 * Builds a valid path for a new document: normalizes the given value and
 * guarantees the category prefix. For game_visible, includes the playerId.
 */
export function makePath(category: string, value: string, playerId?: string): string {
  const prefix = categoryPrefix(category);
  const raw = normalizePath(value);
  if (prefix === "visible/") {
    const who = normalizePath(playerId ?? "shared");
    return raw.startsWith(`${prefix}${who}/`) ? raw : `${prefix}${who}/${raw}`;
  }
  return raw.startsWith(prefix) ? raw : `${prefix}${raw}`;
}

/** Removes the category prefix ("glossary/", "brain/"...) from a path. */
export function stripCategoryPrefix(path: string): string {
  for (const p of CATEGORY_PREFIXES) {
    if (path.startsWith(p)) return path.slice(p.length);
  }
  return path;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces link tokens of the old path with the new path in a document body,
 * using exact token boundaries so `пример_ссылки_2` is never touched when
 * renaming `пример_ссылки`.
 *
 * Handles both forms:
 * - wiki: `[[glossary/x|label]]`, `[[glossary/x]]` (and unprefixed `[[x]]`)
 * - archive markdown: `[text](/x.md)`, `[text](/x/)`, `[text](/x#anchor)`
 */
export function replacePathLinks(
  content: string,
  oldPath: string,
  newPath: string
): string {
  const oldRel = stripCategoryPrefix(oldPath);
  const newRel = stripCategoryPrefix(newPath);

  let out = content;

  // Prefixed wiki form: [[glossary/x  (boundary: ]] or |)
  out = out.replace(
    new RegExp(`\\[\\[${escapeRegExp(oldPath)}(?=\\]\\]|\\||$)`, "g"),
    `[[${newPath}`
  );
  // Prefixed archive markdown form: ](/glossary/x.md), ](/glossary/x/)
  out = out.replace(
    new RegExp(`\\]\\(\\/${escapeRegExp(oldPath)}(?=\\)|#|/|\\.md|$)`, "g"),
    `](/${newPath}`
  );

  // Unprefixed wiki form: [[x  (archive style inside glossary)
  out = out.replace(
    new RegExp(`\\[\\[${escapeRegExp(oldRel)}(?=\\]\\]|\\||$)`, "g"),
    `[[${newRel}`
  );
  // Unprefixed archive markdown form: ](/x.md), ](/x/), ](/x)
  out = out.replace(
    new RegExp(`\\]\\(\\/${escapeRegExp(oldRel)}(?=\\)|#|/|\\.md|$)`, "g"),
    `](/${newRel}`
  );

  return out;
}
