import { getSession } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { onGameEvent, onUserEvent } from "@/src/shared/lib/events/game-events";
import { onStep, getSnapshot } from "@/src/shared/lib/agents/step-tracker";
import type { IStepEvent } from "@/src/shared/lib/agents/step-tracker";
import { debugLog } from "@/src/shared/lib/debug-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("errors.unauthorized", { status: 401 });
  }

  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId ?? null;
  const isAdmin = session.role === "admin";

  // Step sessions this user may observe.
  const stepSessionIds: string[] = [];

  const personal = await prisma.session.findFirst({
    where: { playerId: session.userId, type: "personal" },
    select: { id: true },
  });
  if (personal) stepSessionIds.push(personal.id);

  if (masterId) {
    if (isAdmin) {
      const gameSession = await prisma.session.findFirst({
        where: { masterId, type: "game" },
        select: { id: true },
      });
      if (gameSession) stepSessionIds.push(gameSession.id);

      const builderSession = await prisma.session.findFirst({
        where: { masterId, type: "builder" },
        select: { id: true },
      });
      if (builderSession) stepSessionIds.push(builderSession.id);
    } else {
      const access = await prisma.gameAccess.findUnique({
        where: { userId_masterId: { userId: session.userId, masterId } },
      });
      if (access) {
        const gameSession = await prisma.session.findFirst({
          where: { masterId, type: "game" },
          select: { id: true },
        });
        if (gameSession) stepSessionIds.push(gameSession.id);
      }
    }
  }

  const encoder = new TextEncoder();
  let closed = false;
  const unsubscribers: Array<() => void> = [];

  const enqueue = (controller: ReadableStreamDefaultController, payload: string) => {
    if (!closed) controller.enqueue(encoder.encode(payload));
  };

  const stream = new ReadableStream({
    start(controller) {
      enqueue(controller, "retry: 2000\n\n");
      debugLog("stream-sse", "connection opened", { userId: session.userId.slice(0, 8), stepSessions: stepSessionIds.length });

      // Global broadcast events.
      unsubscribers.push(onGameEvent((event) => {
        enqueue(controller, `data: ${JSON.stringify({ ns: "events", type: event.type, payload: event.payload })}\n\n`);
      }));

      // Per-user events.
      unsubscribers.push(onUserEvent(session.userId, (event) => {
        enqueue(controller, `data: ${JSON.stringify({ ns: "events", type: event.type, payload: event.payload })}\n\n`);
      }));

      // Step events + snapshot catch-up for each observable session.
      for (const sid of stepSessionIds) {
        unsubscribers.push(onStep(sid, (ev: IStepEvent) => {
          enqueue(controller, `data: ${JSON.stringify({ ns: "steps", sessionId: sid, ...ev })}\n\n`);
        }));

        const snap = getSnapshot(sid);
        if (snap?.processing) {
          enqueue(controller, `data: ${JSON.stringify({ ns: "steps", sessionId: sid, type: "started", seq: snap.seq })}\n\n`);
          if (snap.tool) {
            enqueue(controller, `data: ${JSON.stringify({ ns: "steps", sessionId: sid, type: "step", tool: snap.tool, detail: snap.detail, seq: snap.seq })}\n\n`);
          }
        }
      }

      const keepAlive = () => {
        if (closed) return;
        enqueue(controller, ": keepalive\n\n");
        setTimeout(keepAlive, 30000);
      };
      setTimeout(keepAlive, 30000);
    },
    cancel() {
      closed = true;
      for (const u of unsubscribers) u();
      debugLog("stream-sse", "connection cancelled", { userId: session.userId.slice(0, 8) });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
