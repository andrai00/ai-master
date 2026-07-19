"use server";

import { getDb } from "@/src/shared/lib/db/instance";
import { hasAnyAdmin } from "@/src/shared/lib/db/users";

export async function needsSetup(): Promise<boolean> {
  await getDb();
  return !(await hasAnyAdmin());
}
