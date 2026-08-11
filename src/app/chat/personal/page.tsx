import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { Shell } from "@/src/widgets/shell";
import { ChatPersonalView } from "@/src/pages-layer/chat-personal";

export default async function PersonalChatPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const activeGame = await getActiveGame();
  const isDev = activeGame?.mode === "development";

  return (
    <Shell user={session}>
      <ChatPersonalView disabled={isDev} userId={session.userId} isAdmin={session.role === "admin"} />
    </Shell>
  );
}
