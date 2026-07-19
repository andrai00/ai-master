import { redirect } from "next/navigation";
import { getDb } from "@/src/shared/lib/db/instance";
import { hasAnyAdmin } from "@/src/shared/lib/db/users";
import { getSession } from "@/src/shared/lib/auth/session";
import { Shell } from "@/src/widgets/shell";

export default async function Home() {
  await getDb();

  if (!(await hasAnyAdmin())) {
    redirect("/setup");
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

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
        <span style={{ fontSize: 14 }}>Чат игры</span>
        <span style={{ fontSize: 12 }}>Здесь будет общение с мастером и игроками</span>
      </div>
    </Shell>
  );
}
