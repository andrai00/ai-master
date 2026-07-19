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

  return <Shell user={session} />;
}
