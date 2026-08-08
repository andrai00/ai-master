import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { Shell } from "@/src/widgets/shell";
import { ChatPersonalView } from "@/src/pages-layer/chat-personal";

export default async function PersonalChatPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <Shell user={session}>
      <ChatPersonalView />
    </Shell>
  );
}
