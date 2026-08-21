import { describe, it, expect } from "vitest";
import { streamText, zodSchema, type ModelMessage } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { z } from "zod";
import { stepsToModelMessages } from "./run-steps";

const tools = {
  search_rules: {
    description: "search",
    inputSchema: zodSchema(z.object({ query: z.string() })),
    execute: async ({ query }: { query: string }) => ({ query, docs: [{ id: "1" }] }),
  },
};

function streamOf(chunks: LanguageModelV4StreamPart[]) {
  return { stream: simulateReadableStream({ chunks }) };
}

describe("agent tool loop with a mock model", () => {
  it("calls a tool, gets the result, then produces the final text", async () => {
    const mock = new MockLanguageModelV4({
      doStream: [
        // call 1: the model decides to call search_rules
        streamOf([
          { type: "text-start", id: "t0" },
          { type: "tool-call", toolCallId: "c1", toolName: "search_rules", input: JSON.stringify({ query: "плут" }) },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } } },
        ]),
        // call 2: after the tool result, the model answers
        streamOf([
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Ответ по найденному" },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } } },
        ]),
      ],
    });

    const result = await streamText({
      model: mock,
      system: "sys",
      messages: [{ role: "user", content: "поищи" }],
      tools,
      stopWhen: (input) => {
        const steps = input.steps ?? [];
        if (steps.length >= 2) return true;
        return steps.length > 0 && steps[steps.length - 1].toolCalls.length === 0;
      },
    });
    const text = await result.text;
    expect(text).toContain("Ответ по найденному");
  });

  it("accepts messages rebuilt by stepsToModelMessages (retry regression)", async () => {
    const mock = new MockLanguageModelV4({
      doStream: streamOf([
        { type: "text-start", id: "t0" },
        { type: "text-delta", id: "t0", delta: "Нашёл: плут" },
        { type: "text-end", id: "t0" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } } },
      ]),
    });

    const retryMsgs: ModelMessage[] = [
      { role: "user", content: "какие архетипы у плута" },
      ...stepsToModelMessages([
        {
          toolCalls: [{ toolCallId: "c1", toolName: "search_rules", input: { query: "Плут" } }],
          toolResults: [{ toolCallId: "c1", toolName: "search_rules", output: { total: 3, docs: [] } }],
        },
      ]),
      { role: "user", content: "ответь по этим данным" },
    ];

    const result = await streamText({
      model: mock,
      system: "sys",
      messages: retryMsgs,
      tools: {},
    });
    const text = await result.text;
    expect(text).toContain("Нашёл: плут");
  });
});
