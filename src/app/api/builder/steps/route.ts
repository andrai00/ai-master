import { NextRequest } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { getEvents } from "@/src/shared/lib/agents/step-tracker";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return new Response("Missing sessionId", { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let lastSeq = 0;
  let lastSession: ReturnType<typeof getEvents> = undefined;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      const poll = () => {
        if (closed) return;
        const data = getEvents(sessionId);
        
        // Reset seq when session recreated (new processing started)
        if (data && data !== lastSession) {
          lastSeq = 0;
          lastSession = data;
        }
        if (!data) {
          lastSession = undefined;
        }

        if (!data) {
          setTimeout(poll, 500);
          return;
        }

        // Send new events since last seq
        for (const ev of data.events) {
          if (ev.seq > lastSeq) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(ev)}\n\n`)
            );
            lastSeq = ev.seq;
          }
        }

        // Check for terminal events
        const last = data.events[data.events.length - 1];
        if (last && (last.type === "done" || last.type === "stopped")) {
          controller.close();
          return;
        }

        setTimeout(poll, 300);
      };

      setTimeout(poll, 100);
    },
    cancel() {
      closed = true;
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
