// Line-based helpers for document editing (Cursor-style line edits).
//
// read_document can return a numbered view (`numbered: true`), and
// update_document accepts `edits` that target absolute 1-based line numbers,
// so the model changes only the lines that need changing instead of rewriting
// the whole document.

export interface TLineEdit {
  /** 1-based number of the first line to replace (from a numbered read). */
  start_line: number;
  /** 1-based number of the last line to replace (inclusive). Defaults to start_line.
   * Set end_line = start_line - 1 to INSERT new_lines before start_line. */
  end_line?: number;
  /** Replacement text (may span multiple lines). Empty/missing deletes the range. */
  new_lines?: string;
}

export interface TAppliedLineEdit {
  start_line: number;
  end_line: number;
  replacedLines: number;
  insertedLines: number;
}

export interface TLineEditResult {
  content: string;
  totalLines: number;
  applied: TAppliedLineEdit[];
}

export interface TNumberedView {
  view: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  hasMore: boolean;
}

/** Dominant line ending of the document (CRLF when present, else LF). */
export function detectEol(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

export function splitLines(content: string): string[] {
  return content.split(detectEol(content));
}

export function countLines(content: string): number {
  return splitLines(content).length;
}

/**
 * Builds a numbered view of the document: `   12 | line content` rows with
 * absolute 1-based numbers, so the model can target exact lines in edits.
 * `lineLimit` of 0 (default) returns every line.
 */
export function numberLines(
  content: string,
  startLine = 1,
  lineLimit = 0
): TNumberedView {
  const lines = splitLines(content);
  const total = lines.length;
  const from = Math.max(1, Math.floor(startLine));
  const to = lineLimit > 0 ? Math.min(from + lineLimit - 1, total) : total;
  const width = String(total).length;
  const rows: string[] = [];
  for (let n = from; n <= to; n++) {
    rows.push(`${String(n).padStart(width)} | ${lines[n - 1]}`);
  }
  return {
    view: rows.join("\n"),
    startLine: from,
    endLine: to,
    totalLines: total,
    hasMore: to < total,
  };
}

function normalizeNewLines(value: string): string[] {
  const lines = value.replace(/\r\n/g, "\n").replace(/\r/g, "").split("\n");
  // "x\n" means two lines ("x" and "") — keep that. An empty string means
  // delete the range (no lines), which is handled by the caller.
  return value === "" ? [] : lines;
}

/**
 * Applies non-overlapping line edits to the current document content in a
 * single pass (one write). Edits are validated against the actual line count
 * and applied bottom-up so the line numbers from the model's numbered read
 * stay valid. Throws a descriptive error on invalid/overlapping ranges.
 */
export function applyLineEdits(content: string, edits: TLineEdit[]): TLineEditResult {
  if (edits.length === 0) throw new Error("errors.editRange: no edits provided");
  const eol = detectEol(content);
  const lines = splitLines(content);
  const total = lines.length;

  const normalized = edits.map((e, idx) => {
    if (!Number.isInteger(e.start_line) || (e.end_line !== undefined && !Number.isInteger(e.end_line))) {
      throw new Error(`errors.editRange: edit #${idx + 1}: line numbers must be integers`);
    }
    const start = e.start_line;
    const end = e.end_line ?? start;
    return {
      idx,
      start_line: start,
      end_line: end,
      newLines: normalizeNewLines(e.new_lines ?? ""),
    };
  });

  for (const e of normalized) {
    if (e.start_line < 1 || e.start_line > total + 1) {
      throw new Error(
        `errors.editRange: edit #${e.idx + 1}: start_line=${e.start_line} is out of range (document has ${total} lines, 1-based). Re-read with numbered:true for correct line numbers.`
      );
    }
    if (e.end_line < 0 || e.end_line > total) {
      throw new Error(
        `errors.editRange: edit #${e.idx + 1}: end_line=${e.end_line} is out of range (document has ${total} lines, 1-based).`
      );
    }
    const diff = e.start_line - e.end_line;
    if (diff > 1) {
      throw new Error(
        `errors.editRange: edit #${e.idx + 1}: end_line must be >= start_line - 1 (end_line = start_line - 1 inserts before start_line; end_line >= start_line replaces the range). Got start_line=${e.start_line}, end_line=${e.end_line}.`
      );
    }
  }

  // Overlap check: a replace occupies [start, end], an insert is the empty
  // interval [start, start - 1]. Overlapping edits would corrupt line numbers.
  const sorted = [...normalized].sort((a, b) => a.start_line - b.start_line);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (Math.max(prev.start_line, cur.start_line) <= Math.min(prev.end_line, cur.end_line)) {
      throw new Error(
        `errors.editOverlap: edits overlap around lines ${cur.start_line}..${cur.end_line}. Provide disjoint ranges in one call, or apply them in separate calls.`
      );
    }
  }

  // Apply bottom-up so earlier line numbers from the model's read stay valid.
  const desc = [...normalized].sort((a, b) => b.start_line - a.start_line);
  const applied: TAppliedLineEdit[] = [];
  for (const e of desc) {
    const startIdx = e.start_line - 1;
    const isInsert = e.end_line === e.start_line - 1;
    if (isInsert) {
      lines.splice(startIdx, 0, ...e.newLines);
      applied.push({
        start_line: e.start_line,
        end_line: e.end_line,
        replacedLines: 0,
        insertedLines: e.newLines.length,
      });
    } else {
      const removed = e.end_line - e.start_line + 1;
      lines.splice(startIdx, removed, ...e.newLines);
      applied.push({
        start_line: e.start_line,
        end_line: e.end_line,
        replacedLines: removed,
        insertedLines: e.newLines.length,
      });
    }
  }

  return { content: lines.join(eol), totalLines: lines.length, applied };
}
