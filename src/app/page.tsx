import { redirect } from "next/navigation";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";
import { Shell } from "@/src/widgets/shell";
import { ChatGamePlaceholder } from "@/src/pages-layer/chat-game/ui/chat-game-placeholder";

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

  if (session.role === "player") {
    const game = await prisma.master.findFirst({ where: { isCurrent: true } });
    if (!game) {
      redirect("/api/logout?redirect=/login");
    }
    const hasAccess =
      game.ownerId === session.userId ||
      (await prisma.gameAccess.count({ where: { userId: session.userId, masterId: game.id } })) > 0;
    if (!hasAccess) {
      redirect("/api/logout?redirect=/login");
    }
  }

  return (
    <Shell user={session}>
      <ChatGamePlaceholder />
    </Shell>
  );
}
