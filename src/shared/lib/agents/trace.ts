import "server-only";
import { getPrisma } from "@/src/shared/lib/db/prisma";

export type TraceChat = "game" | "personal" | "builder";

interface ITraceInput {
  chat: TraceChat;
  sessionId: string;
  phase: string;
  stepIndex?: number;
  toolName?: string;
  args?: string;
  result?: string;
  prompt?: string;
  elapsedMs?: number;
  error?: string;
  finishReason?: string;
}

const enabled = process.env.AGENT_TRACE === "1";

/**
 * Writes one diagnostic trace event. Only active when AGENT_TRACE=1.
 * Fire-and-forget: logging must never block or break the agent run.
 * Content is capped (prompts/results can be huge) to keep the DB sane.
 */
export function traceAgent(input: ITraceInput): void {
  if (!enabled) return;
  const cap = (s: string | undefined, n: number) => (s === undefined ? undefined : s.length > n ? s.slice(0, n) + `…<truncated ${s.length - n}>` : s);

  try {
    void getPrisma()
      .traceEvent.create({
        data: {
          chat: input.chat,
          sessionId: input.sessionId,
          phase: input.phase,
          stepIndex: input.stepIndex,
          toolName: input.toolName,
          args: cap(input.args, 2000),
          result: cap(input.result, 4000),
          prompt: cap(input.prompt, 20000),
          elapsedMs: input.elapsedMs,
          error: cap(input.error, 1000),
          finishReason: input.finishReason,
        },
      })
      .catch((e) => {
        console.error("[trace] write failed:", e instanceof Error ? e.message : String(e));
      });
  } catch {
    // never break the agent
  }
}
