"use server";

import { getSession } from "@/src/shared/lib/auth/session";

export async function testAiConnectionAction(
  provider: string,
  baseUrl: string,
  apiKey: string
): Promise<{
  success: boolean;
  message: string;
  models?: string[];
}> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { success: false, message: "errors.forbidden" };
  }

  if (!apiKey) return { success: false, message: "errors.apiKeyMissing" };

  const url = baseUrl || getDefaultUrl(provider);
  const modelsUrl = `${url}/models`;

  try {
    const res = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, message: `Error ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json();
    let models: string[] = [];

    if (Array.isArray(data.data)) {
      models = data.data.map((m: any) => m.id).filter(Boolean);
    } else if (Array.isArray(data.models)) {
      models = data.models.map((m: any) => m.name || m.model || m.id).filter(Boolean);
    } else if (Array.isArray(data)) {
      models = data.map((m: any) => m.id || m.name || m.model).filter(Boolean);
    }

    return { success: true, message: `Found: ${models.length}`, models };
  } catch (e: any) {
    return { success: false, message: e.message || "errors.unknownError" };
  }
}

export async function testAiConnectionFromDbAction(): Promise<{
  success: boolean;
  message: string;
  models?: string[];
}> {
  const { getPrisma } = await import("@/src/shared/lib/db/prisma");
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { success: false, message: "errors.forbidden" };
  }

  const prisma = getPrisma();
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  if (!config) return { success: false, message: "errors.configNotFound" };

  return testAiConnectionAction(config.provider, config.baseUrl, config.apiKey);
}

function getDefaultUrl(provider: string): string {
  const defaults: Record<string, string> = {
    openrouter: "https://openrouter.ai/api/v1",
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    groq: "https://api.groq.com/openai/v1",
    ollama: "http://localhost:11434/v1",
  };
  return defaults[provider] || "";
}
