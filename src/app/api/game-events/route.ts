import { getSession } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "player") {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      const check = async () => {
        if (closed) return;
        try {
          const prisma = getPrisma();
          const game = await prisma.master.findFirst({ where: { isCurrent: true } });
          if (!game) {
            controller.enqueue(encoder.encode("data: kick\n\n"));
            controller.close();
            return;
          }
          const hasAccess =
            game.ownerId === session.userId ||
            (await prisma.gameAccess.count({ where: { userId: session.userId, masterId: game.id } })) > 0;
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
