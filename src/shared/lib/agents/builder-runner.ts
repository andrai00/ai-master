import { generateText, isStepCount } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";
import { createDocumentTool } from "./tools/create-document.tool";
import { updateDocumentTool } from "./tools/update-document.tool";
import { readDocumentTool } from "./tools/read-document.tool";
import { searchDocumentsTool } from "./tools/search-documents.tool";
import { readParsedFileTool } from "./tools/read-parsed-file.tool";
import { listUploadedFilesTool } from "./tools/list-uploaded-files.tool";
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TBuilderResult =
  | { kind: "text"; text: string }
  | { kind: "error"; error: string };

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function loadSystemPrompt(): string {
  const promptPath = join(process.cwd(), "src", "shared", "config", "prompts", "builder-system.md");
  return readFileSync(promptPath, "utf-8");
}

// ---------------------------------------------------------------------------
// AI Provider factory
// ---------------------------------------------------------------------------

async function createProvider() {
  const prisma = getPrisma();
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });

  if (!config || !config.apiKey) {
    throw new Error("AI provider is not configured. Go to Settings → AI Settings.");
  }

  const baseURL = config.baseUrl || undefined;
  const model = config.model || "gpt-4o";

  const openai = createOpenAI({ apiKey: config.apiKey, baseURL });
  return { model: openai(model), provider: config.provider };
}

// ---------------------------------------------------------------------------
// Tools registry
// ---------------------------------------------------------------------------

function getTools() {
  return {
    read_parsed_file: readParsedFileTool,
    list_uploaded_files: listUploadedFilesTool,
    create_document: createDocumentTool,
    update_document: updateDocumentTool,
    read_document: readDocumentTool,
    search_documents: searchDocumentsTool,
  };
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

async function buildContext(sessionId: string): Promise<{
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  system: string;
}> {
  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const session = await getSession();

  const uiLanguage = "en"; // TODO: read from i18n setting

  let systemPrompt = loadSystemPrompt();
  systemPrompt = systemPrompt.replace("{uiLanguage}", uiLanguage);

  // Add active game info
  if (activeGame) {
    const master = await prisma.master.findUnique({
      where: { id: activeGame.currentMasterId },
      select: { name: true, description: true },
    });
    if (master) {
      systemPrompt += `\n\n## Current Game\n- Name: ${master.name}\n- Description: ${master.description ?? "none"}\n`;
    }
  }

  // Add admin name
  if (session) {
    systemPrompt += `\n- Admin: ${session.displayName || session.login}\n`;
  }

  // Load recent messages
  const recentMessages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { role: true, content: true },
  });

  const messages = recentMessages.map((m) => ({
    role: (m.role === "admin" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  return { messages, system: systemPrompt };
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runBuilderAgent(
  sessionId: string,
  userMessage: string
): Promise<TBuilderResult> {
  try {
    const ctx = await buildContext(sessionId);

    // Append the new user message
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...ctx.messages,
      { role: "user", content: userMessage },
    ];

    const provider = await createProvider();
    const tools = getTools();

    const result = await generateText({
      model: provider.model,
      system: ctx.system,
      messages,
      tools,
      stopWhen: isStepCount(10), // allow up to 10 tool-calling steps
    });

    return { kind: "text", text: result.text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { kind: "error", error: message };
  }
}
