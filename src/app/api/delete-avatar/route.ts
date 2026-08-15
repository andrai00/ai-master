import { NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "errors.unauthorized" }, { status: 401 });

  const prisma = getPrisma();
  await prisma.user.update({
    where: { id: session.userId },
    data: { avatar: "" },
  });

  broadcastGameEvent("profile_updated", { userId: session.userId });

  return NextResponse.json({ success: true });
}
