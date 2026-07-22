import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { Shell } from "@/src/widgets/shell";

export default async function PersonalChatPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <Shell user={session}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 8,
          color: "var(--text-muted)",
        }}
      >
        <span style={{ fontSize: 14 }}>Личный чат с мастером</span>
        <span style={{ fontSize: 12 }}>Здесь будет приватное общение</span>
      </div>
    </Shell>
  );
}
