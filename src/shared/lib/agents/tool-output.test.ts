import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodSchema } from "ai";
import { sanitizeToolOutput, wrapToolSet } from "./tool-output";

describe("sanitizeToolOutput", () => {
  it("converts Date to ISO string (the No-output-generated regression)", () => {
    const out = sanitizeToolOutput({
      docs: [{ id: "1", updatedAt: new Date("2026-01-01T00:00:00Z") }],
    });
    expect(out).toEqual({ docs: [{ id: "1", updatedAt: "2026-01-01T00:00:00.000Z" }] });
  });
});

describe("wrapToolSet", () => {
  it("wraps execute so the output is JSON-safe", async () => {
    const tools = wrapToolSet({
      t: {
        description: "test",
        inputSchema: zodSchema(z.object({})),
        execute: async () => ({ d: new Date(0) }),
      },
    });
    const out = await (tools.t as unknown as { execute: () => Promise<unknown> }).execute();
    expect(out).toEqual({ d: "1970-01-01T00:00:00.000Z" });
  });
});
