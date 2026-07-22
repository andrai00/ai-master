import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { Shell } from "@/src/widgets/shell";
import { BuilderChatView } from "@/src/pages-layer/builder-chat/ui/builder-chat-view";

export default async function BuilderPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/");

  const activeGame = await getActiveGame();
  if (activeGame?.mode !== "development") redirect("/");

  return (
    <Shell user={session}>
      <BuilderChatView />
    </Shell>
  );
}
