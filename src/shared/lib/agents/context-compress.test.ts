import { describe, it, expect } from "vitest";
import type { ModelMessage } from "ai";
import { compressMessages } from "./context-compress";

function conversationWithToolStep(): ModelMessage[] {
  return [
    { role: "user", content: "вопрос" },
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "c1", toolName: "search_rules", input: { query: "x" } }],
    },
    {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: "c1",
        toolName: "search_rules",
        output: { type: "json", value: { total: 1 } },
      }],
    },
  ];
}

describe("compressMessages", () => {
  it("returns null when under the threshold", () => {
    expect(compressMessages({ messages: conversationWithToolStep(), threshold: 100_000 })).toBeNull();
  });

  it("keeps the last tool step pair intact (never a dangling tool-result)", () => {
    const result = compressMessages({ messages: conversationWithToolStep(), threshold: 1 });
    expect(result).not.toBeNull();
    const msgs = result!.messages;
    const last = msgs[msgs.length - 1] as { role: string; content: Array<{ type: string }> };
    expect(last.role).toBe("tool");
    expect(last.content[0].type).toBe("tool-result");
    const prev = msgs[msgs.length - 2] as { role: string };
    expect(prev.role).toBe("assistant");
  });

  it("produces a valid sequence: user, compressed summary, assistant tool-call, tool result", () => {
    const result = compressMessages({ messages: conversationWithToolStep(), threshold: 1 });
    const roles = result!.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "assistant", "tool"]);
  });
});
