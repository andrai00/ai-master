import { NextRequest } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { getSteps } from "@/src/shared/lib/agents/step-tracker";

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

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      let lastCount = 0;
      const poll = () => {
        if (closed) return;
        const data = getSteps(sessionId);
        if (!data) {
          setTimeout(poll, 500);
          return;
        }

        // Send new steps
        if (data.steps.length > lastCount) {
          const newSteps = data.steps.slice(lastCount);
          lastCount = data.steps.length;
          for (const step of newSteps) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ tool: step.tool, detail: step.detail })}\n\n`)
            );
          }
        }

        if (data.done) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, error: data.lastError })}\n\n`));
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
