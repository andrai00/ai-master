import type { ModelMessage, ToolResultPart } from "ai";

type RunStep = {
  toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  toolResults?: Array<{ toolCallId: string; toolName: string; output: unknown }>;
};

/**
 * Rebuilds ModelMessages from a run's steps so a no-tools retry can answer
 * from the results the main run already collected. Tool results are wrapped
 * in the ToolResultOutput shape required by ai@7 ({ type: "json", value }) and
 * put in `role: "tool"` messages — feeding the raw output fails streamText's
 * message validation.
 */
export function stepsToModelMessages(steps: RunStep[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const step of steps) {
    const calls = step.toolCalls ?? [];
    if (calls.length > 0) {
      out.push({
        role: "assistant",
        content: calls.map((c) => ({
          type: "tool-call",
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          input: c.input,
        })),
      });
    }
    for (const r of step.toolResults ?? []) {
      out.push({
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId: r.toolCallId,
          toolName: r.toolName,
          output: { type: "json", value: r.output } as ToolResultPart["output"],
        }],
      });
    }
  }
  return out;
}
