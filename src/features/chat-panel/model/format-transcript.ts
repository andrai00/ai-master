// Debug transcript formatter: turns a stored tool-call row (args + result
// JSON) into a short, meaningful one-liner for the AGENT_DEBUG internals block.
//
// HOW TO EXTEND — every tool that the agents may call should get a handler
// below. Add one entry `TOOL_HANDLERS["<tool_name>"] = { label, tone, format }`
// where `a` is the parsed args object and `r` the parsed result object. If you
// skip a tool, the fallback just prints the raw args JSON.

export type TToolTone = "search" | "read" | "write" | "delete" | "roll" | "other";

export interface IToolSummary {
  /** Short human verb phrase (English — the internals block is dev tooling). */
  label: string;
  /** Meaningful detail: what was searched, lines changed/deleted, etc. */
  detail: string;
  tone: TToolTone;
}

function parse(v: string | null | undefined): unknown {
  if (!v) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function shortId(v: unknown): string {
  const s = asStr(v);
  return s.length > 8 ? s.slice(0, 8) + "…" : s;
}

function lineEditSummary(applied: unknown): string {
  if (!Array.isArray(applied) || applied.length === 0) return "lines (no changes)";
  return applied
    .map((e) => {
      const a = e as Record<string, unknown>;
      const start = a.start_line;
      const end = a.end_line;
      const replaced = typeof a.replacedLines === "number" ? a.replacedLines : 0;
      const inserted = typeof a.insertedLines === "number" ? a.insertedLines : 0;
      if (replaced === 0) return `insert ${inserted} @${start}`;
      const range = start === end ? `${start}` : `${start}-${end}`;
      if (inserted === 0) return `${range}: delete ${replaced}`;
      return `${range}: ${replaced}→${inserted}`;
    })
    .join(", ");
}

interface IHandler {
  label: string;
  tone: TToolTone;
  format(a: Record<string, unknown>, r: Record<string, unknown>): string;
}

const TOOL_HANDLERS: Record<string, IHandler> = {
  // --- read / search ---
  search_rules: {
    label: "search",
    tone: "search",
    format(a, r) {
      const q = asStr(a.query).trim();
      const type = asStr(a.type);
      const total = typeof r.total === "number" ? r.total : undefined;
      const returned = typeof r.returned === "number" ? r.returned : undefined;
      const hit = returned !== undefined && total !== undefined ? `${returned}/${total}` : undefined;
      return `"${q}"${type ? ` (${type})` : ""}${hit ? ` → ${hit} docs` : ""}`;
    },
  },
  glossary_overview: {
    label: "overview",
    tone: "search",
    format(_a, r) {
      const types = Array.isArray(r.types) ? r.types.length : undefined;
      const total = typeof r.totalDocuments === "number" ? r.totalDocuments : undefined;
      return `glossary: ${total ?? "?"} docs, ${types ?? "?"} types`;
    },
  },
  get_brain: {
    label: "brain",
    tone: "read",
    format(a, r) {
      const topic = asStr(a.topic);
      if (topic) {
        const m = Array.isArray(r.matches) ? (r.matches[0] as Record<string, unknown> | undefined) : undefined;
        const size = typeof m?.totalSize === "number" ? m.totalSize : undefined;
        const hasMore = m?.hasMore === true;
        return `section "${topic}"${size !== undefined ? ` (${size} chars${hasMore ? ", truncated" : ""})` : ""}`;
      }
      const sections = Array.isArray(r.sections) ? r.sections.length : 0;
      return `index + ${sections} sections`;
    },
  },
  read_document: {
    label: "read",
    tone: "read",
    format(a, r) {
      const title = asStr(r.title) || asStr(a.id) || "doc";
      const quote = title.length > 60 ? title.slice(0, 57) + "…" : title;
      if (r.mode === "numbered") {
        return `"${quote}" lines ${r.startLine}-${r.endLine}/${r.totalLines}`;
      }
      if (typeof r.totalSize === "number" && typeof r.offset === "number") {
        const chunk = asStr(r.text).length;
        return `"${quote}" ${r.offset}/${r.totalSize} chars (${chunk})`;
      }
      const len = typeof r.content === "string" ? r.content.length : typeof r.text === "string" ? r.text.length : undefined;
      return `"${quote}"${len !== undefined ? ` (${len} chars)` : ""}`;
    },
  },
  read_lines: {
    label: "read lines",
    tone: "read",
    format(a, r) {
      const title = asStr(r.title) || asStr(a.id) || "doc";
      const quote = title.length > 60 ? title.slice(0, 57) + "…" : title;
      const range = typeof r.startLine === "number" && typeof r.endLine === "number"
        ? `lines ${r.startLine}-${r.endLine}/${r.totalLines}`
        : "";
      return `"${quote}" ${range}`;
    },
  },
  get_gm_notes: {
    label: "notes",
    tone: "read",
    format(_a, r) {
      const n = Array.isArray(r) ? r.length : Array.isArray(r.notes) ? r.notes.length : undefined;
      return `${n ?? "?"} notes`;
    },
  },
  get_scene_state: {
    label: "scene",
    tone: "read",
    format(_a, r) {
      const title = asStr(r.title);
      if (!title) return "no scene";
      const len = typeof r.content === "string" ? r.content.length : undefined;
      return `"${title}"${len !== undefined ? ` (${len} chars)` : ""}`;
    },
  },
  get_player_sheet: {
    label: "player data",
    tone: "read",
    format(a, r) {
      const pid = asStr(a.playerId) || asStr(r.playerId);
      const docs = Array.isArray(r.documents) ? r.documents.length : Array.isArray(r) ? r.length : undefined;
      return `${pid ? `player ${shortId(pid)} · ` : ""}${docs ?? "?"} docs`;
    },
  },
  get_players: {
    label: "roster",
    tone: "read",
    format(_a, r) {
      const n = Array.isArray(r) ? r.length : undefined;
      return `${n ?? "?"} participants`;
    },
  },
  list_all_documents: {
    label: "corpus overview",
    tone: "read",
    format(_a, r) {
      const cats = Array.isArray(r.categories) ? r.categories : [];
      const total = cats.reduce((s, c) => s + (typeof c.total === "number" ? c.total : 0), 0);
      return `${total} docs in ${cats.length} categories`;
    },
  },
  list_uploaded_files: {
    label: "uploaded files",
    tone: "read",
    format(_a, r) {
      const n = Array.isArray(r) ? r.length : undefined;
      return `${n ?? "?"} files`;
    },
  },
  explore_archive: {
    label: "archive",
    tone: "read",
    format(_a, r) {
      const folders = Array.isArray(r.folders) ? r.folders.length : undefined;
      const files = typeof r.totalFiles === "number" ? r.totalFiles : undefined;
      return `${folders ?? "?"} folders${files !== undefined ? `, ${files} files` : ""}`;
    },
  },
  read_file: {
    label: "read file",
    tone: "read",
    format(_a, r) {
      const name = asStr(r.filename);
      const size = typeof r.size === "number" ? r.size : undefined;
      return `"${name}"${size !== undefined ? ` (${size} bytes)` : ""}`;
    },
  },
  get_chat_summary: {
    label: "chat summary",
    tone: "read",
    format(_a, r) {
      const len = typeof r.content === "string" ? r.content.length : 0;
      return len > 0 ? `${len} chars` : "empty";
    },
  },
  get_builder_guide: {
    label: "guide",
    tone: "read",
    format(a) {
      return `topic: "${asStr(a.topic)}"`;
    },
  },
  resolve_glossary_link: {
    label: "resolve link",
    tone: "search",
    format(a, r) {
      const matches = Array.isArray(r.matches) ? r.matches.length : undefined;
      return `"${asStr(a.title)}" → ${matches ?? "?"} matches`;
    },
  },
  validate_links: {
    label: "validate links",
    tone: "read",
    format(a, r) {
      const lv = (r.linkValidation ?? {}) as Record<string, unknown>;
      const linkCount = typeof lv.linkCount === "number" ? lv.linkCount : undefined;
      const errCount = typeof lv.errorCount === "number" ? lv.errorCount : undefined;
      const quote = asStr(r.title) || asStr(a.id);
      return `"${quote}": ${linkCount ?? "?"} links, ${errCount ?? "?"} errors`;
    },
  },

  // --- write ---
  create_document: {
    label: "create",
    tone: "write",
    format(a, r) {
      const title = asStr(r.title) || asStr(a.title) || "doc";
      const type = asStr(a.type);
      const created = r.created === true;
      return `"${title}" [${type}]${created ? "" : " (already exists)"}`;
    },
  },
  update_document: {
    label: "update",
    tone: "write",
    format(a, r) {
      const title = asStr(r.title) || asStr(a.id) || "doc";
      const quote = title.length > 60 ? title.slice(0, 57) + "…" : title;
      if (r.mode === "lines" || Array.isArray(r.applied)) {
        return `"${quote}" — ${lineEditSummary(r.applied)}`;
      }
      const total = typeof r.totalLines === "number" ? r.totalLines : undefined;
      return `"${quote}" rewritten${total !== undefined ? ` (${total} lines)` : ""}`;
    },
  },
  update_char_sheet: {
    label: "sheet update",
    tone: "write",
    format(a, r) {
      const title = asStr(r.title) || asStr(a.title) || `player ${shortId(a.playerId)}`;
      if (r.created === true) return `created "${title}"`;
      if (r.mode === "lines" || Array.isArray(r.applied)) {
        return `"${title}" — ${lineEditSummary(r.applied)}`;
      }
      return `"${title}" rewritten`;
    },
  },
  write_note: {
    label: "note",
    tone: "write",
    format(a, r) {
      const title = asStr(r.title) || asStr(a.title) || "note";
      const len = asStr(a.content).length;
      const verb = r.created === true ? "created" : r.updated === true ? "updated" : "written";
      return `"${title}" ${verb} (${len} chars)`;
    },
  },
  set_scene_state: {
    label: "set scene",
    tone: "write",
    format(a, r) {
      const verb = r.created === true ? "created" : "updated";
      return `scene ${verb} (${asStr(a.content).length} chars)`;
    },
  },
  update_chat_summary: {
    label: "update summary",
    tone: "write",
    format(a) {
      return `summary (${asStr(a.content).length} chars)`;
    },
  },
  rename_document: {
    label: "rename",
    tone: "write",
    format(a, r) {
      const from = asStr(r.oldPath) || asStr(a.id);
      const to = asStr(r.newPath) || asStr(a.newPath);
      return `${from} → ${to}`;
    },
  },
  bulk_import_to_glossary: {
    label: "bulk import",
    tone: "write",
    format(_a, r) {
      const imported = typeof r.imported === "number" ? r.imported : undefined;
      const byType = r.byType as Record<string, number> | undefined;
      const summary = byType ? Object.entries(byType).map(([t, n]) => `${t}:${n}`).join(", ") : "";
      return `${imported ?? "?"} docs${summary ? ` (${summary})` : ""}`;
    },
  },

  // --- delete ---
  delete_document: {
    label: "delete",
    tone: "delete",
    format(_a, r) {
      const title = asStr(r.title) || "doc";
      const category = asStr(r.category);
      return `"${title}" [${category}] — deleted`;
    },
  },
  delete_documents_by_type: {
    label: "delete by type",
    tone: "delete",
    format(_a, r) {
      if (r.confirmRequired === true) {
        return `dry-run: would delete ${r.wouldDelete ?? "?"}`;
      }
      return `${r.deleted ?? "?"} docs of type "${asStr(r.type)}" deleted`;
    },
  },
  delete_uploaded_files: {
    label: "delete files",
    tone: "delete",
    format(a, r) {
      const n = typeof r.deleted === "number" ? r.deleted : "?";
      const where = asStr(r.folderPath) || `ids [${shortId(Array.isArray(a.fileIds) ? a.fileIds[0] : undefined)}]`;
      return `${n} uploaded files (${where}) deleted`;
    },
  },

  // --- dice / rolls ---
  roll_dice: {
    label: "roll",
    tone: "roll",
    format(a, r) {
      const expr = asStr(a.expression) || asStr(r.expression);
      const reason = asStr(a.reason) || asStr(r.reason);
      const total = typeof r.total === "number" ? ` = ${r.total}` : "";
      return `"${reason}" ${expr}${total}`;
    },
  },
  present_roll_check: {
    label: "roll check",
    tone: "roll",
    format(a, r) {
      const name = asStr(a.checkName);
      const expr = asStr(a.diceExpression);
      const count = typeof a.count === "number" ? a.count : 1;
      const players = Array.isArray(a.targetPlayers) ? a.targetPlayers.length : Array.isArray(r.playerIds) ? r.playerIds.length : "?";
      const assigned = typeof r.assigned === "number" ? ` → ${r.assigned} rolls` : "";
      return `"${name}" ${expr}×${count} → ${players} players${assigned}`;
    },
  },
  get_rolls: {
    label: "rolls",
    tone: "roll",
    format(_a, r) {
      const n = Array.isArray(r) ? r.length : undefined;
      return `${n ?? "?"} rolls`;
    },
  },
  remove_roll: {
    label: "remove roll",
    tone: "roll",
    format(_a, r) {
      return `roll ${shortId(r.rollId)} cancelled`;
    },
  },
  confirm_rolls: {
    label: "confirm rolls",
    tone: "roll",
    format(_a, r) {
      return `${r.confirmed ?? "?"} rolls confirmed`;
    },
  },
};

function formatArgsFallback(tool: string, args: unknown): string {
  if (args == null) return "";
  const raw = typeof args === "string" ? args : JSON.stringify(args);
  return raw && raw !== "null" ? truncate(raw, 140) : "";
}

/**
 * Produces a concise one-line summary for a tool call. `argsJson` and
 * `resultJson` are the raw stored JSON strings (may be null for live rows).
 */
export function formatToolCall(
  toolName: string | null | undefined,
  argsJson: string | null | undefined,
  resultJson: string | null | undefined
): IToolSummary {
  const tool = toolName ?? "";
  const a = (parse(argsJson) ?? {}) as Record<string, unknown>;
  const r = (parse(resultJson) ?? {}) as Record<string, unknown>;

  const handler = TOOL_HANDLERS[tool];
  if (!handler) {
    let detail = formatArgsFallback(tool, argsJson);
    if (!detail && resultJson) detail = truncate(resultJson, 140);
    return { label: tool, detail, tone: "other" };
  }

  let detail: string;
  try {
    detail = handler.format(a, r);
  } catch {
    detail = formatArgsFallback(tool, argsJson);
  }
  return { label: handler.label, detail: truncate(detail, 160), tone: handler.tone };
}
