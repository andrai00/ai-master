import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { Shell } from "@/src/widgets/shell";
import { LogsView } from "@/src/pages-layer/logs/ui/logs-view";

export default async function LogsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/");

  return (
    <Shell user={session}>
      <LogsView />
    </Shell>
  );
}
