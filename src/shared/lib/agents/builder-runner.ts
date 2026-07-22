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
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IStepLabel {
  /** Raw tool name — client maps to translated label + icon */
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

  const baseURL = config.baseUrl || undefined;
  const model = config.model || "gpt-4o";

  const openai = createOpenAI({ apiKey: config.apiKey, baseURL });
  return openai(model);
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
    // non-critical — don't break the agent over log failures
    console.error("[builder-runner] Failed to write thought log");
  }
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
    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId ?? "";

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...ctx.messages,
      { role: "user", content: userMessage },
    ];

    const model = await createProvider();
    const tools = getTools();

    // Collect step labels during execution
    const steps: IStepLabel[] = [];

    const result = await generateText({
      model,
      system: ctx.system,
      messages,
      tools,
      stopWhen: isStepCount(10),
      onStepFinish: async (event: StepResult<typeof tools>) => {
        // Extract tool calls and their results from this step
        const toolCalls = event.toolCalls ?? [];
        const toolResults = event.toolResults ?? [];

        if (toolCalls.length > 0) {
          for (let i = 0; i < toolCalls.length; i++) {
            const call = toolCalls[i];
            const result = toolResults[i];
            const toolName = call.toolName as string;
            steps.push({ tool: toolName });

            // Log full details to ThoughtLog
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
          // Final text step — this is the model's response
          steps.push({ tool: "final" });
        }
      },
    });

    return { kind: "text", text: result.text, steps };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { kind: "error", error: message };
  }
}
