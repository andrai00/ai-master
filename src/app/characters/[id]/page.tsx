import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { getDocumentAction } from "@/src/shared/actions/documents/get-document";
import { Shell } from "@/src/widgets/shell";
import { DocViewer } from "@/src/pages-layer/doc-viewer";

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const doc = await getDocumentAction(id);

  if (!doc) {
    return (
      <Shell user={session}>
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>
          Document not found
        </div>
      </Shell>
    );
  }

  return (
    <Shell user={session}>
      <DocViewer title={doc.title} content={doc.content} />
    </Shell>
  );
}
