import { describe, it, expect } from "vitest";
import { stepsToModelMessages } from "./run-steps";

describe("stepsToModelMessages", () => {
  it("wraps tool results as { type: 'json', value } in role tool", () => {
    const msgs = stepsToModelMessages([
      {
        toolCalls: [{ toolCallId: "c1", toolName: "search_rules", input: { query: "Плут" } }],
        toolResults: [{ toolCallId: "c1", toolName: "search_rules", output: { total: 3 } }],
      },
    ]);
    expect(msgs).toHaveLength(2);

    const call = msgs[0] as {
      role: string;
      content: Array<{ type: string; toolCallId: string; input: unknown }>;
    };
    expect(call.role).toBe("assistant");
    expect(call.content[0].type).toBe("tool-call");
    expect(call.content[0].toolCallId).toBe("c1");
    expect(call.content[0].input).toEqual({ query: "Плут" });

    const result = msgs[1] as {
      role: string;
      content: Array<{ type: string; toolCallId: string; output: { type: string; value: unknown } }>;
    };
    expect(result.role).toBe("tool");
    expect(result.content[0].type).toBe("tool-result");
    expect(result.content[0].toolCallId).toBe("c1");
    expect(result.content[0].output.type).toBe("json");
    expect(result.content[0].output.value).toEqual({ total: 3 });
  });

  it("drops orphan tool-calls that have no matching tool result", () => {
    const msgs = stepsToModelMessages([
      {
        toolCalls: [
          { toolCallId: "c1", toolName: "present_roll_check", input: { checkName: "Инициатива" } },
          { toolCallId: "c2", toolName: "get_rolls", input: {} },
        ],
        toolResults: [{ toolCallId: "c2", toolName: "get_rolls", output: [] }],
      },
    ]);
    expect(msgs).toHaveLength(2);

    const call = msgs[0] as {
      role: string;
      content: Array<{ toolCallId: string }>;
    };
    expect(call.role).toBe("assistant");
    expect(call.content).toHaveLength(1);
    expect(call.content[0].toolCallId).toBe("c2");

    const result = msgs[1] as { role: string; content: Array<{ toolCallId: string }> };
    expect(result.role).toBe("tool");
    expect(result.content[0].toolCallId).toBe("c2");
  });
});
