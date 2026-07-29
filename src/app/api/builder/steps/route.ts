import { NextRequest } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { getEvents, onStep } from "@/src/shared/lib/agents/step-tracker";
import type { IStepEvent } from "@/src/shared/lib/agents/step-tracker";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("errors.unauthorized", { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return new Response("errors.missingParam", { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let lastSeq = 0;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      unsubscribe = onStep(sessionId, (ev: IStepEvent) => {
        if (closed) return;
        if (ev.seq > lastSeq) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
          lastSeq = ev.seq;
        }
        if (ev.type === "done" || ev.type === "stopped") {
          lastSeq = 0;
        }
      });

      const existing = getEvents(sessionId);
      if (existing) {
        for (const ev of existing.events) {
          if (ev.seq > lastSeq) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
            lastSeq = ev.seq;
          }
        }
      }

      const keepAlive = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(": keepalive\n\n"));
        setTimeout(keepAlive, 30000);
      };
      setTimeout(keepAlive, 30000);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
