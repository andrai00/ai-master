"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";

export async function needsSetupAction(): Promise<boolean> {
  const prisma = getPrisma();
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  return !admin;
}
