import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { Shell } from "@/src/widgets/shell";
import { AiSettingsView } from "@/src/pages-layer/ai-settings";

export default async function AiSettingsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/");

  return (
    <Shell user={session}>
      <AiSettingsView />
    </Shell>
  );
}
