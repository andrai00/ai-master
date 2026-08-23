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
  // Skip orphan tool-calls (a call whose toolCallId has no matching result).
  // A run can end with a tool call whose result never arrived (provider stream
  // cut off). Feeding that call back without its result makes the next
  // streamText throw AI_MissingToolResultsError, so filter them out — same
  // guard persistRun and buildTranscript already apply.
  const resultCallIds = new Set<string>();
  for (const step of steps) {
    for (const r of step.toolResults ?? []) {
      if (r.toolCallId) resultCallIds.add(r.toolCallId);
    }
  }

  const out: ModelMessage[] = [];
  for (const step of steps) {
    const calls = (step.toolCalls ?? []).filter(
      (c) => c.toolCallId && resultCallIds.has(c.toolCallId)
    );
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
