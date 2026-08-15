import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { Shell } from "@/src/widgets/shell";
import { ChatPersonalView } from "@/src/pages-layer/chat-personal";

export default async function PersonalChatPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const activeGame = await getActiveGame();
  const isDev = activeGame?.mode === "development";

  if (session.role === "player") {
    if (!activeGame) {
      redirect("/api/logout?redirect=/login");
    }
    const prisma = getPrisma();
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
      <ChatPersonalView disabled={isDev} userId={session.userId} isAdmin={session.role === "admin"} />
    </Shell>
  );
}
