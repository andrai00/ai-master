"use server";

import { deleteSessionCookie } from "@/src/shared/lib/auth/session";

export async function logoutAction(): Promise<void> {
  await deleteSessionCookie();
}
