import type { ToolSet } from "ai";

/**
 * Converts a tool output to a JSON-serializable value. Prisma returns Date
 * objects (updatedAt etc.); ai@7 validates tool results as JSONValue and a
 * raw Date fails validation ("No output generated"). Dates become ISO strings.
 */
export function sanitizeToolOutput(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

/** Wraps every tool's execute so its output is always JSON-safe. */
export function wrapToolSet(tools: ToolSet): ToolSet {
  const wrapped: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const t = tool as { execute?: (args: unknown) => Promise<unknown> };
    wrapped[name] = t.execute
      ? { ...t, execute: async (args: unknown) => sanitizeToolOutput(await t.execute!(args)) }
      : t;
  }
  return wrapped as ToolSet;
}
