import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";
import { Shell } from "@/src/widgets/shell";
import { UsersTable } from "@/src/pages-layer/admin-users/ui/users-table";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  return (
    <Shell user={session}>
      <UsersTable />
    </Shell>
  );
}
