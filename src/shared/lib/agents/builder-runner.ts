import { generateText, isStepCount, type StepResult } from "ai";
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
import { getCachedFile } from "./file-cache";
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IStepLabel {
  tool: string;
}

export type TBuilderResult =
  | { kind: "text"; text: string; steps: IStepLabel[] }
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

  const model = config.model?.trim() || "gpt-4o";
  const baseURL = config.baseUrl?.trim() || undefined;
  const provider = config.provider?.trim() || "openai";

  if (!baseURL && provider !== "openai") {
    console.warn(
      `[builder] Provider "${provider}" has no Base URL set. ` +
      `Requests will go to OpenAI's default API.`
    );
  }

  console.log(`[builder] Provider: ${provider}, model: ${model}, baseURL: ${baseURL ?? "default"}`);
  const openai = createOpenAI({ apiKey: config.apiKey, baseURL });
  // Use .chat() to force Chat Completions API (not Responses API).
  // Chat Completions is the universally compatible endpoint for all OpenAI-compatible providers.
  return openai.chat(model);
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

  let systemPrompt = loadSystemPrompt();
  systemPrompt = systemPrompt.replace("{uiLanguage}", "en");

  if (activeGame) {
    const master = await prisma.master.findUnique({
      where: { id: activeGame.currentMasterId },
      select: { name: true, description: true },
    });
    if (master) {
      systemPrompt += `\n\n## Current Game\n- Name: ${master.name}\n- Description: ${master.description ?? "none"}\n`;
    }
  }

  if (session) {
    systemPrompt += `\n- Admin: ${session.displayName || session.login}\n`;
  }

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
// Logging
// ---------------------------------------------------------------------------

async function logStepToDB(
  masterId: string,
  toolName: string,
  details: string
): Promise<void> {
  try {
    const prisma = getPrisma();
    await prisma.thoughtLog.create({
      data: {
        masterId,
        agent: "builder",
        content: `[${toolName}]\n${details}`,
      },
    });
  } catch {
    console.error("[builder-runner] Failed to write thought log");
  }
}

// ---------------------------------------------------------------------------
// Responses API → text extraction (fallback for non-OpenAI-format providers)
// ---------------------------------------------------------------------------

/**
 * Some providers (DeepSeek v4 via OpenRouter or direct) return the Responses API
 * format ({"output": [...]}) instead of Chat Completions format ({"choices": [...]}).
 * The AI SDK can't parse this. As a fallback, extract text from the error.
 */
function extractTextFromError(err: unknown): string | null {
  const obj = err as Record<string, unknown>;
  const body = obj.responseBody as string | undefined;
  if (!body) return null;

  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const output = json.output as Array<Record<string, unknown>> | undefined;
    if (!output) return null;

    const parts: string[] = [];
    for (const item of output) {
      if (item.type === "message" && item.role === "assistant") {
        const content = item.content;
        if (Array.isArray(content)) {
          for (const part of content as Array<Record<string, unknown>>) {
            if (part.type === "output_text" && typeof part.text === "string") {
              parts.push(part.text);
            }
          }
        } else if (typeof content === "string") {
          parts.push(content);
        }
      }
    }
    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runBuilderAgent(
  sessionId: string,
  userMessage: string,
  fileIds: string[] = []
): Promise<TBuilderResult> {
  try {
    const ctx = await buildContext(sessionId);
    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId ?? "";

    let fileHint = "";
    if (fileIds.length > 0) {
      const names = fileIds
        .map((id) => getCachedFile(id)?.filename ?? id)
        .join(", ");
      fileHint = `\n\n[Attached files: ${names}. Use list_uploaded_files() to see them and read_parsed_file(fileId) to read each.]`;
    }

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...ctx.messages,
      { role: "user", content: userMessage + fileHint },
    ];

    const model = await createProvider();
    const tools = getTools();
    const steps: IStepLabel[] = [];

    const result = await generateText({
      model,
      system: ctx.system,
      messages,
      tools,
      stopWhen: isStepCount(10),
      onStepFinish: async (event: StepResult<typeof tools>) => {
        const toolCalls = event.toolCalls ?? [];
        const toolResults = event.toolResults ?? [];

        if (toolCalls.length > 0) {
          for (let i = 0; i < toolCalls.length; i++) {
            const call = toolCalls[i];
            const result = toolResults[i];
            const toolName = call.toolName as string;
            steps.push({ tool: toolName });

            const inputPreview =
              typeof call.input === "object"
                ? JSON.stringify(call.input).slice(0, 300)
                : "";
            const resultPreview =
              result?.output !== undefined
                ? JSON.stringify(result.output).slice(0, 200)
                : "";
            const details = `Input: ${inputPreview}\nResult: ${resultPreview}`;

            if (masterId) {
              await logStepToDB(masterId, toolName, details);
            }
          }
        } else if (event.text) {
          steps.push({ tool: "final" });
        }
      },
    });

    return { kind: "text", text: result.text, steps };
  } catch (err: unknown) {
    // Try to extract text from the error body (Responses API fallback)
    const extracted = extractTextFromError(err);
    if (extracted) {
      console.log("[builder] Extracted text from Responses API error body");
      return { kind: "text", text: extracted, steps: [{ tool: "final" }] };
    }

    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[builder] Agent error:", rawMessage);

    const errObj = err as Record<string, unknown>;
    let message = rawMessage;

    if (rawMessage.includes("Invalid JSON response")) {
      message =
        "AI provider returned a response format the SDK doesn't understand. " +
        "Try using a different model or contact support.";
    } else if (rawMessage.includes("401") || rawMessage.includes("Unauthorized")) {
      message = "AI provider rejected the request. Check your API key in AI Settings.";
    } else if (rawMessage.includes("404") || rawMessage.includes("not found")) {
      message = "AI model not found. Check the model name in AI Settings.";
    }

    return { kind: "error", error: message };
  }
}
