import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { Shell } from "@/src/widgets/shell";
import { BuilderChatView } from "@/src/pages-layer/chat-game/ui/builder-chat-view";

export default async function BuilderPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return (
    <Shell user={session}>
      <BuilderChatView />
    </Shell>
  );
}
