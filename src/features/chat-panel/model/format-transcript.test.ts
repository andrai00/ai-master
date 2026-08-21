import { describe, it, expect } from "vitest";
import { formatToolCall } from "./format-transcript";

function call(tool: string, args: unknown, result?: unknown) {
  return formatToolCall(tool, args === undefined ? null : JSON.stringify(args), result === undefined ? null : JSON.stringify(result));
}

describe("formatToolCall", () => {
  it("search_rules shows the query and hit count", () => {
    const s = call("search_rules", { query: "fire damage", type: "spell" }, { total: 42, returned: 5 });
    expect(s.detail).toContain("fire damage");
    expect(s.detail).toContain("(spell)");
    expect(s.detail).toContain("5/42");
    expect(s.tone).toBe("search");
  });

  it("read_document numbered shows the absolute line range", () => {
    const s = call("read_document", { id: "x", numbered: true }, { mode: "numbered", title: "Sheet", startLine: 1, endLine: 12, totalLines: 40 });
    expect(s.detail).toContain("lines 1-12/40");
    expect(s.tone).toBe("read");
  });

  it("update_document lines mode summarizes replace/insert/delete", () => {
    const replace = call("update_document", { id: "x" }, { mode: "lines", applied: [{ start_line: 3, end_line: 5, replacedLines: 3, insertedLines: 2 }] });
    expect(replace.detail).toContain("3-5: 3→2");
    expect(replace.tone).toBe("write");

    const del = call("update_document", { id: "x" }, { mode: "lines", applied: [{ start_line: 20, end_line: 20, replacedLines: 1, insertedLines: 0 }] });
    expect(del.detail).toContain("20: delete 1");

    const ins = call("update_document", { id: "x" }, { mode: "lines", applied: [{ start_line: 4, end_line: 3, replacedLines: 0, insertedLines: 1 }] });
    expect(ins.detail).toContain("insert 1 @4");
  });

  it("update_document full mode notes the rewrite", () => {
    const s = call("update_document", { id: "x" }, { mode: "full", title: "Doc", totalLines: 300 });
    expect(s.detail).toContain("rewritten");
    expect(s.detail).toContain("300");
  });

  it("delete_document flags the deletion with danger tone", () => {
    const s = call("delete_document", { docId: "x" }, { deleted: true, title: "Foo", category: "brain" });
    expect(s.detail).toContain("Foo");
    expect(s.detail).toContain("deleted");
    expect(s.tone).toBe("delete");
  });

  it("delete_documents_by_type dry-run is explicit", () => {
    const s = call("delete_documents_by_type", { type: "article" }, { wouldDelete: 323, confirmRequired: true });
    expect(s.detail).toContain("dry-run");
    expect(s.detail).toContain("323");
  });

  it("roll_dice shows expression and total", () => {
    const s = call("roll_dice", { expression: "1d20+5", reason: "perception" }, { total: 17 });
    expect(s.detail).toContain("1d20+5");
    expect(s.detail).toContain("17");
    expect(s.tone).toBe("roll");
  });

  it("present_roll_check shows targets and assigned count", () => {
    const s = call("present_roll_check", { checkName: "Инициатива", diceExpression: "1d20", targetPlayers: ["a", "b"], count: 1 }, { assigned: 2 });
    expect(s.detail).toContain("1d20×1");
    expect(s.detail).toContain("2 players");
  });

  it("create_document notes created vs exists", () => {
    const created = call("create_document", { title: "Гоблин", type: "monster" }, { created: true });
    expect(created.detail).toContain("[monster]");
    expect(created.detail).not.toContain("already exists");
    const exists = call("create_document", { title: "Гоблин", type: "monster" }, { created: false });
    expect(exists.detail).toContain("already exists");
  });

  it("rename_document shows old → new path", () => {
    const s = call("rename_document", { newPath: "glossary/bestiary/331-camel" }, { oldPath: "glossary/331-camel", newPath: "glossary/bestiary/331-camel" });
    expect(s.detail).toContain("glossary/331-camel → glossary/bestiary/331-camel");
  });

  it("unknown tools fall back to the raw args", () => {
    const s = call("brand_new_tool", { foo: "bar" });
    expect(s.label).toBe("brand_new_tool");
    expect(s.tone).toBe("other");
    expect(s.detail).toContain("bar");
  });

  it("handles missing args/result gracefully", () => {
    const s = formatToolCall("brand_new_tool", null, null);
    expect(s.detail).toBe("");
    expect(s.label).toBe("brand_new_tool");
  });
});
