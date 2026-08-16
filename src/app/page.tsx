import { redirect } from "next/navigation";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { Shell } from "@/src/widgets/shell";
import { ChatGameView } from "@/src/pages-layer/chat-game";

export default async function Home() {
  const prisma = getPrisma();
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });

  if (!admin) {
    redirect("/setup");
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const activeGame = await getActiveGame();
  const isDev = activeGame?.mode === "development";

  if (session.role === "player") {
    if (!activeGame) {
      redirect("/api/logout?redirect=/login");
    }
    const hasAccess =
      (await prisma.gameAccess.count({
        where: { userId: session.userId, masterId: activeGame.currentMasterId },
      })) > 0;
    if (!hasAccess) {
      redirect("/api/logout?redirect=/login");
    }
  }

  return (
    <Shell user={session}>
      <ChatGameView disabled={isDev} userId={session.userId} isAdmin={session.role === "admin"} />
    </Shell>
  );
}
