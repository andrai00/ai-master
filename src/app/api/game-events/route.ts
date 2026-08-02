import { getSession } from "@/src/shared/lib/auth/session";
import { onGameEvent, onUserEvent } from "@/src/shared/lib/events/game-events";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("errors.unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Subscribe to broadcast events (mode_switch, game_updated, etc.)
      onGameEvent((event) => {
        if (closed) return;
        const data = JSON.stringify({ type: event.type, payload: event.payload });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      // Subscribe to per-user events (kick, access-loss notifications)
      onUserEvent(session.userId, (event) => {
        if (closed) return;
        const data = JSON.stringify({ type: event.type, payload: event.payload });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      // Keep-alive every 30s — push replaces polling for both admins and players
      const keepAlive = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(": keepalive\n\n"));
        setTimeout(keepAlive, 30000);
      };
      setTimeout(keepAlive, 30000);
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
