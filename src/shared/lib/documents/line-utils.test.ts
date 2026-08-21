import { describe, it, expect } from "vitest";
import { splitLines, countLines, numberLines, applyLineEdits } from "./line-utils";

describe("splitLines / countLines", () => {
  it("splits on LF", () => {
    expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"]);
    expect(countLines("a\nb\nc")).toBe(3);
  });

  it("counts a trailing newline as an extra empty line", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b", ""]);
    expect(countLines("a\nb\n")).toBe(3);
  });

  it("handles CRLF without leaving \\r", () => {
    expect(splitLines("a\r\nb\r\nc")).toEqual(["a", "b", "c"]);
  });

  it("handles an empty document as one empty line", () => {
    expect(splitLines("")).toEqual([""]);
    expect(countLines("")).toBe(1);
  });
});

describe("numberLines", () => {
  it("numbers every line with absolute 1-based numbers", () => {
    const out = numberLines("one\ntwo\nthree");
    expect(out.view).toBe("1 | one\n2 | two\n3 | three");
    expect(out.totalLines).toBe(3);
    expect(out.hasMore).toBe(false);
    expect(out.startLine).toBe(1);
    expect(out.endLine).toBe(3);
  });

  it("right-aligns numbers to the total line count width", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `line${i + 1}`);
    const out = numberLines(lines.join("\n"));
    expect(out.view).toMatch(/^ 1 \| line1\n 2 \| line2/);
    expect(out.view).toMatch(/12 \| line12/);
  });

  it("supports paging with start_line and line_limit", () => {
    const out = numberLines("a\nb\nc\nd\ne", 2, 2);
    expect(out.view).toBe("2 | b\n3 | c");
    expect(out.hasMore).toBe(true);
    expect(out.startLine).toBe(2);
    expect(out.endLine).toBe(3);
    expect(out.totalLines).toBe(5);
  });

  it("clamps start_line beyond the end", () => {
    const out = numberLines("a\nb", 99, 1);
    expect(out.view).toBe("");
    expect(out.hasMore).toBe(false);
  });
});

describe("applyLineEdits", () => {
  const doc = ["## Бой", "", "Инициатива: 10", "Хиты: 30", "Урон: 1d8", "Заметки:"].join("\n");

  it("replaces a single line", () => {
    const r = applyLineEdits(doc, [{ start_line: 4, new_lines: "Хиты: 25" }]);
    expect(r.content).toBe(["## Бой", "", "Инициатива: 10", "Хиты: 25", "Урон: 1d8", "Заметки:"].join("\n"));
    expect(r.applied).toEqual([{ start_line: 4, end_line: 4, replacedLines: 1, insertedLines: 1 }]);
    expect(r.totalLines).toBe(6);
  });

  it("replaces a multi-line range with a multi-line block", () => {
    const r = applyLineEdits(doc, [{ start_line: 3, end_line: 5, new_lines: "Инициатива: 12\nХиты: 25\nУрон: 1d10\nРеакция: нет" }]);
    expect(r.content).toBe(["## Бой", "", "Инициатива: 12", "Хиты: 25", "Урон: 1d10", "Реакция: нет", "Заметки:"].join("\n"));
    expect(r.applied).toEqual([{ start_line: 3, end_line: 5, replacedLines: 3, insertedLines: 4 }]);
  });

  it("deletes a range with empty new_lines", () => {
    const r = applyLineEdits(doc, [{ start_line: 3, end_line: 5, new_lines: "" }]);
    expect(r.content).toBe(["## Бой", "", "Заметки:"].join("\n"));
    expect(r.applied[0]).toMatchObject({ replacedLines: 3, insertedLines: 0 });
  });

  it("inserts before a line with end_line = start_line - 1", () => {
    const r = applyLineEdits(doc, [{ start_line: 3, end_line: 2, new_lines: "Новый блок:" }]);
    expect(r.content).toBe(["## Бой", "", "Новый блок:", "Инициатива: 10", "Хиты: 30", "Урон: 1d8", "Заметки:"].join("\n"));
    expect(r.applied[0]).toMatchObject({ replacedLines: 0, insertedLines: 1 });
  });

  it("inserts before the first line (start_line = 1, end_line = 0)", () => {
    const r = applyLineEdits(doc, [{ start_line: 1, end_line: 0, new_lines: "# Документ" }]);
    expect(r.content).toBe(["# Документ", ...doc.split("\n")].join("\n"));
  });

  it("appends after the last line (start_line = total + 1)", () => {
    const r = applyLineEdits(doc, [{ start_line: 7, end_line: 6, new_lines: "Итог" }]);
    expect(r.content).toBe([...doc.split("\n"), "Итог"].join("\n"));
  });

  it("applies several non-overlapping edits in one pass", () => {
    const r = applyLineEdits(doc, [
      { start_line: 4, new_lines: "Хиты: 25" },
      { start_line: 5, new_lines: "Урон: 2d8" },
    ]);
    expect(r.content).toBe(["## Бой", "", "Инициатива: 10", "Хиты: 25", "Урон: 2d8", "Заметки:"].join("\n"));
    expect(r.applied.length).toBe(2);
  });

  it("keeps CRLF line endings when replacing", () => {
    const crlf = "## Бой\r\nХиты: 30\r\nЗаметки:";
    const r = applyLineEdits(crlf, [{ start_line: 2, new_lines: "Хиты: 25" }]);
    expect(r.content).toBe("## Бой\r\nХиты: 25\r\nЗаметки:");
  });

  it("rejects edits out of range with a helpful message", () => {
    expect(() => applyLineEdits(doc, [{ start_line: 99, new_lines: "x" }])).toThrow(/out of range/);
    expect(() => applyLineEdits(doc, [{ start_line: 1, end_line: 99, new_lines: "x" }])).toThrow(/out of range/);
  });

  it("rejects malformed ranges (start > end + 1)", () => {
    expect(() => applyLineEdits(doc, [{ start_line: 6, end_line: 3, new_lines: "x" }])).toThrow(/end_line must be >= start_line - 1/);
  });

  it("rejects overlapping edits", () => {
    expect(() =>
      applyLineEdits(doc, [
        { start_line: 3, end_line: 5, new_lines: "x" },
        { start_line: 4, new_lines: "y" },
      ])
    ).toThrow(/overlap/);
  });

  it("rejects an empty edits array", () => {
    expect(() => applyLineEdits(doc, [])).toThrow(/no edits/);
  });
});
