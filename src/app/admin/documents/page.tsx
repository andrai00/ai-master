import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { Shell } from "@/src/widgets/shell";
import { DocumentsView } from "@/src/pages-layer/documents/ui/documents-view";

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/");

  return (
    <Shell user={session}>
      <DocumentsView />
    </Shell>
  );
}
