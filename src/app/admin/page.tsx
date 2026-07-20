import { redirect } from "next/navigation";
import { getSession } from "@/src/shared/lib/auth/session";

export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }
  redirect("/admin/users");
}
