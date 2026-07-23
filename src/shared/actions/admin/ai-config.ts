"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getSession } from "@/src/shared/lib/auth/session";

export interface IAiConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  contextLimit: number;
  extra: string;
}

export async function getAiConfigAction(): Promise<IAiConfig> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { provider: "custom", baseUrl: "", apiKey: "", model: "", contextLimit: 0, extra: "" };
  }

  const prisma = getPrisma();
  const config = await prisma.appConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    contextLimit: config.contextLimit,
    extra: config.extra,
  };
}

export async function saveAiConfigAction(
  data: Partial<IAiConfig>
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, error: "Нет прав" };

  const prisma = getPrisma();
  await prisma.appConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return { success: true };
}
