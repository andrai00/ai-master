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
import { initSessionSteps, addStep, finishSteps, failSteps } from "./step-tracker";
import { resetCancellation, throwIfCancelled } from "./parse-cancel";
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
// Processing guard (prevents concurrent sends per session)
// ---------------------------------------------------------------------------

const globalGuard = globalThis as unknown as {
  processing: Map<string, AbortController>;
};

function getGuard(): Map<string, AbortController> {
  if (!globalGuard.processing) globalGuard.processing = new Map();
  return globalGuard.processing;
}

/** Returns AbortSignal if processing started, or null if already processing. */
export function startProcessing(sessionId: string): AbortController | null {
  const g = getGuard();
  if (g.has(sessionId)) return null; // already processing
  const ac = new AbortController();
  g.set(sessionId, ac);
  return ac;
}

export function stopProcessing(sessionId: string): boolean {
  const g = getGuard();
  const ac = g.get(sessionId);
  if (ac) {
    ac.abort();
    g.delete(sessionId);
    return true;
  }
  return false;
}

function endProcessing(sessionId: string): void {
  getGuard().delete(sessionId);
}

export function isProcessing(sessionId: string): boolean {
  return getGuard().has(sessionId);
}

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

  console.log(`[builder] Provider: ${provider}, model: ${model}, baseURL: ${baseURL ?? "default"}`);
  const openai = createOpenAI({ apiKey: config.apiKey, baseURL });
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
// Logging (full request/response + per-step)
// ---------------------------------------------------------------------------

async function writeThoughtLog(
  masterId: string,
  agent: string,
  content: string
): Promise<void> {
  try {
    const prisma = getPrisma();
    await prisma.thoughtLog.create({
      data: { masterId, agent, content },
    });
  } catch {
    console.error("[builder] Failed to write thought log");
  }
}

function formatAiMessages(
  system: string,
  messages: Array<{ role: string; content: string }>
): string {
  const lines = ["=== SYSTEM PROMPT ===", system, "", "=== CONVERSATION ==="];
  for (const m of messages) {
    lines.push(`\n[${m.role.toUpperCase()}]:`);
    lines.push(m.content);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runBuilderAgent(
  sessionId: string,
  userMessage: string,
  fileIds: string[] = []
): Promise<TBuilderResult> {
  const ac = startProcessing(sessionId);
  if (!ac) {
    return { kind: "error", error: "Already processing. Wait for the current task to finish." };
  }

  // Initialize step tracking for real-time UI
  initSessionSteps(sessionId);
  resetCancellation();

  try {
    const ctx = await buildContext(sessionId);
    throwIfCancelled();

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

    // Log the full request
    const requestLog = formatAiMessages(ctx.system, messages);
    if (masterId) {
      await writeThoughtLog(masterId, "builder", "=== REQUEST ===\n" + requestLog);
    }

    const model = await createProvider();
    throwIfCancelled();

    const tools = getTools();
    const steps: IStepLabel[] = [];
    const stepDetails: string[] = [];

    const result = await generateText({
      model,
      system: ctx.system,
      messages,
      tools,
      stopWhen: isStepCount(80), // large files need many read+create steps
      abortSignal: ac.signal,
      onStepFinish: async (event: StepResult<typeof tools>) => {
        const toolCalls = event.toolCalls ?? [];
        const toolResults = event.toolResults ?? [];

        if (toolCalls.length > 0) {
          for (let i = 0; i < toolCalls.length; i++) {
            const call = toolCalls[i];
            const res = toolResults[i];
            const toolName = call.toolName as string;
            steps.push({ tool: toolName });

            // Compute chunk progress for file reading
            let stepDetail: string | undefined;
            if (toolName === "read_parsed_file" && res?.output) {
              const out = res.output as Record<string, unknown>;
              if (typeof out.offset === "number" && typeof out.totalSize === "number") {
                const chunkNum = Math.floor(out.offset / 5000) + 1;
                const totalChunks = Math.ceil(out.totalSize / 5000);
                stepDetail = `${chunkNum}/${totalChunks}`;
              }
            }
            addStep(sessionId, toolName, stepDetail);

            const inputStr = JSON.stringify(call.input, null, 2).slice(0, 1000);
            const outputStr = res?.output !== undefined
              ? JSON.stringify(res.output, null, 2).slice(0, 1000)
              : "(no output)";
            const detail = `Tool: ${toolName}\nInput:\n${inputStr}\nOutput:\n${outputStr}`;
            stepDetails.push(detail);
            if (masterId) await writeThoughtLog(masterId, "builder", detail);
          }
        } else if (event.text) {
          steps.push({ tool: "final" });
          addStep(sessionId, "final");
        }
      },
    });

    // Log the full response
    const responseLog = `=== RESPONSE ===\n${result.text}\n\n=== STEPS ===\n${stepDetails.join("\n\n---\n\n")}`;
    if (masterId) {
      await writeThoughtLog(masterId, "builder", responseLog);
    }

    finishSteps(sessionId);
    return { kind: "text", text: result.text, steps };
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";

    // Check if aborted
    if (err instanceof Error && err.name === "AbortError") {
      failSteps(sessionId, "Aborted by user");
      return { kind: "error", error: "Stopped." };
    }

    // Try to extract text from the error body (Responses API fallback)
    const extracted = extractTextFromError(err);
    if (extracted) {
      finishSteps(sessionId);
      return { kind: "text", text: extracted, steps: [{ tool: "final" }] };
    }

    failSteps(sessionId, rawMessage);
    console.error("[builder] Agent error:", rawMessage);

    let message = rawMessage;
    if (rawMessage.includes("Invalid JSON response")) {
      message = "AI provider returned a response format the SDK doesn't understand.";
    } else if (rawMessage.includes("401") || rawMessage.includes("Unauthorized")) {
      message = "AI provider rejected the request. Check your API key in AI Settings.";
    } else if (rawMessage.includes("404")) {
      message = "AI model not found. Check the model name in AI Settings.";
    }

    return { kind: "error", error: message };
  } finally {
    endProcessing(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Responses API → text extraction (fallback)
// ---------------------------------------------------------------------------

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
