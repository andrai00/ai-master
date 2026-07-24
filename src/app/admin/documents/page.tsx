import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { Shell } from "@/src/widgets/shell";
import { DocumentsView } from "@/src/pages-layer/documents";

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/");

  const activeGame = await getActiveGame();
  if (activeGame?.mode !== "development") redirect("/");

  return (
    <Shell user={session}>
      <DocumentsView />
    </Shell>
  );
}
