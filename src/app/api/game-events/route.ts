import { getSession } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { onGameEvent } from "@/src/shared/lib/events/game-events";

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

      // Subscribe to broadcast events (mode_switch, builder_mode_change, etc.)
      onGameEvent((event) => {
        if (closed) return;
        const data = JSON.stringify({ type: event.type, payload: event.payload });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      // For players: poll access every 3 seconds, send kick if access lost
      if (session.role === "player") {
        const check = async () => {
          if (closed) return;
          try {
            const prisma = getPrisma();
            const activeGame = await prisma.activeGame.findUnique({
              where: { id: "singleton" },
              select: { currentMasterId: true },
            });

            if (!activeGame) {
              controller.enqueue(encoder.encode("data: kick\n\n"));
              controller.close();
              return;
            }

            const hasAccess =
              (await prisma.gameAccess.count({
                where: { userId: session.userId, masterId: activeGame.currentMasterId },
              })) > 0;
            if (!hasAccess) {
              controller.enqueue(encoder.encode("data: kick\n\n"));
              controller.close();
              return;
            }
          } catch {
            controller.close();
            return;
          }
          setTimeout(check, 3000);
        };

        setTimeout(check, 1000);
      } else {
        // Admins: just keep-alive every 30s, actual events come via EventEmitter
        const keepAlive = () => {
          if (closed) return;
          controller.enqueue(encoder.encode(": keepalive\n\n"));
          setTimeout(keepAlive, 30000);
        };
        setTimeout(keepAlive, 30000);
      }
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
