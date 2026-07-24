import { generateText, isStepCount, type StepResult, type ModelMessage } from "ai";
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
import { getCachedFile, removeCachedFiles } from "./file-cache";
import {
  initSession, emitStarted, emitStep, emitDone, emitError,
  emitStopping, emitStopped, clearSession,
} from "./step-tracker";
import { resetCancellation, throwIfCancelled } from "./parse-cancel";
import { readFileSync } from "fs";
import { join } from "path";

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

export function startProcessing(sessionId: string): AbortController | null {
  const g = getGuard();
  if (g.has(sessionId)) return null;
  const ac = new AbortController();
  g.set(sessionId, ac);
  return ac;
}

export function stopProcessing(sessionId: string): boolean {
  const g = getGuard();
  const ac = g.get(sessionId);
  if (ac) {
    emitStopping(sessionId);
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
// AI Provider
// ---------------------------------------------------------------------------

/** Default context windows per provider (used when user doesn't set contextLimit). */
const PROVIDER_DEFAULTS: Record<string, number> = {
  deepseek: 128_000,
  openai: 128_000,
  openrouter: 128_000,
  groq: 128_000,
  ollama: 8_192,
  anthropic: 200_000,
  custom: 128_000,
};

async function getContextLimit(): Promise<number> {
  const prisma = getPrisma();
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  if (config?.contextLimit && config.contextLimit > 0) return config.contextLimit;
  const provider = config?.provider?.trim() || "custom";
  return PROVIDER_DEFAULTS[provider] ?? 128_000;
}

async function createProvider() {
  const prisma = getPrisma();
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  if (!config || !config.apiKey) {
    throw new Error("errors.aiNotConfigured");
  }
  const model = config.model?.trim() || "gpt-4o";
  const baseURL = config.baseUrl?.trim() || undefined;
  const openai = createOpenAI({ apiKey: config.apiKey, baseURL });
  return openai.chat(model);
}

// ---------------------------------------------------------------------------
// Tools
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
// Context
// ---------------------------------------------------------------------------

async function buildContext(sessionId: string) {
  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const sess = await getSession();

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
  if (sess) systemPrompt += `\n- Admin: ${sess.displayName || sess.login}\n`;

  const recent = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { role: true, content: true },
  });

  const messages = recent.map((m) => ({
    role: (m.role === "admin" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  return { messages, system: systemPrompt };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

async function writeThoughtLog(masterId: string, agent: string, content: string) {
  try {
    const prisma = getPrisma();
    await prisma.thoughtLog.create({ data: { masterId, agent, content } });
  } catch {
    // non-critical
  }
}

// ---------------------------------------------------------------------------
// Background runner — no return value, drives SSE events
// ---------------------------------------------------------------------------

export async function runBuilderAgent(
  sessionId: string,
  userMessage: string,
  fileIds: string[] = []
): Promise<void> {
  const ac = startProcessing(sessionId);
  if (!ac) return; // already processing

  initSession(sessionId);
  resetCancellation();

  try {
    // --- Phase: prepare ---
    const ctx = await buildContext(sessionId);
    throwIfCancelled();

    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId ?? "";

    let fileHint = "";
    if (fileIds.length > 0) {
      const names = fileIds.map((id) => getCachedFile(id)?.filename ?? id).join(", ");
      fileHint = `\n\n[Attached files: ${names}. Use list_uploaded_files() to see them and read_parsed_file(fileId) to read each.]`;
    }

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...ctx.messages,
      { role: "user", content: userMessage + fileHint },
    ];

    // Log request
    const requestLog = `=== REQUEST ===\n${ctx.system}\n\n=== CONVERSATION ===\n${messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n\n")}`;
    if (masterId) await writeThoughtLog(masterId, "builder", requestLog);

    const model = await createProvider();
    throwIfCancelled();

    // Read context limit from config (with auto-defaults per provider)
    const contextLimit = await getContextLimit();
    const compressThreshold = contextLimit * 0.7; // start compressing at 70%

    // --- Emit started: all clients see the bubble now ---
    emitStarted(sessionId);

    const tools = getTools();

    // Retry loop: up to 5 attempts for transient errors
    const MAX_RETRIES = 5;
    let result: Awaited<ReturnType<typeof generateText<typeof tools>>> | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        result = await generateText({
          model,
          system: ctx.system,
          messages,
          tools,
          stopWhen: isStepCount(80),
          prepareStep: ({ messages: allMsgs, steps: allSteps }) => {
            const totalChars = allMsgs.reduce((s, m) => s + (typeof m.content === "string" ? m.content.length : 0), 0);
            const estimated = totalChars / 4;
            if (estimated < compressThreshold) return {};

            // Compress: keep system + last admin message + pin last tool step.
            // Summarize everything in between into one message.
            const systemMsg = allMsgs.find(m => m.role === "system");
            const adminMsgs = allMsgs.filter(m => m.role === "user");
            const lastAdmin = adminMsgs[adminMsgs.length - 1];

            // Pin last step (current processing — never compress)
            const lastToolIdx = allMsgs.length - 1;
            const lastTool = allMsgs[lastToolIdx];

            // Build summary from all completed steps
            let reads = 0, created = 0, updated = 0, searched = 0, listed = 0;
            for (const s of allSteps ?? []) {
              for (const c of (s.toolCalls ?? [])) {
                switch (c.toolName) {
                  case "read_parsed_file": reads++; break;
                  case "create_document": created++; break;
                  case "update_document": updated++; break;
                  case "search_documents": searched++; break;
                  case "list_uploaded_files": listed++; break;
                }
              }
            }

            const summary = [
              "[Compressed — previous steps]",
              reads ? `Read ${reads} file chunks` : "",
              created ? `Created ${created} documents` : "",
              updated ? `Updated ${updated} documents` : "",
              searched ? `Searched ${searched} times` : "",
              listed ? `Listed files ${listed} times` : "",
            ].filter(Boolean).join(". ");

            const compressed: ModelMessage[] = [];
            if (systemMsg) compressed.push(systemMsg);
            if (lastAdmin) compressed.push(lastAdmin);
            compressed.push({ role: "assistant", content: summary });
            if (lastTool) compressed.push(lastTool);

            console.log(`[builder] Context compressed: ${allMsgs.length}→${compressed.length} msgs, ${Math.round(estimated/1000)}K→~${Math.round(totalChars/4/compressed.length/1000)}K tokens`);
            return { messages: compressed };
          },
          abortSignal: ac.signal,
          onStepFinish: async (event: StepResult<typeof tools>) => {
            const calls = event.toolCalls ?? [];
            const res = event.toolResults ?? [];
            if (calls.length > 0) {
              for (let i = 0; i < calls.length; i++) {
                const call = calls[i];
                const r = res[i];
                const toolName = call.toolName as string;
                let detail: string | undefined;
                if (toolName === "read_parsed_file" && r?.output) {
                  const out = r.output as Record<string, unknown>;
                  if (typeof out.offset === "number" && typeof out.totalSize === "number") {
                    detail = `${Math.floor(out.offset / 5000) + 1}/${Math.ceil(out.totalSize / 5000)}`;
                  }
                }
                emitStep(sessionId, toolName, detail);
                const inputStr = JSON.stringify(call.input, null, 2).slice(0, 1000);
                const outputStr = r?.output !== undefined ? JSON.stringify(r.output, null, 2).slice(0, 1000) : "(no output)";
                if (masterId) await writeThoughtLog(masterId, "builder", `Tool: ${toolName}\nInput:\n${inputStr}\nOutput:\n${outputStr}`);
              }
            }
          },
        });
        break; // success — exit retry loop
      } catch (err: unknown) {
        lastError = err;

        // Never retry user stop
        if (err instanceof Error && err.name === "AbortError") throw err;
        if (err instanceof DOMException && err.name === "AbortError") throw err;

        // Also check our cancellation flag
        if ((err as Error)?.message === "errors.cancelled") throw err;

        // Don't retry config errors
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("not configured")) throw err;

        // Last attempt — give up
        if (attempt === MAX_RETRIES) throw err;

        // Emit retry step to SSE
        emitStep(sessionId, "retry", `${attempt + 1}/${MAX_RETRIES}`);
        console.warn(`[builder] Attempt ${attempt} failed, retrying in ${2 ** (attempt - 1)}s: ${msg}`);
        await new Promise((r) => setTimeout(r, 2 ** (attempt - 1) * 1000));
      }
    }

    if (!result) throw lastError; // should never happen

    // --- Success: save builder message + log response ---
    const builderText = result.text;
    const prisma = getPrisma();

    await prisma.message.create({
      data: {
        sessionId,
        senderId: (await getSession())?.userId ?? "",
        role: "builder",
        content: builderText,
      },
    });

    if (masterId) {
      await writeThoughtLog(masterId, "builder", `=== RESPONSE ===\n${builderText}`);
    }

    // Auto-summarize if 20+ unsummarized
    const msgCount = await prisma.message.count({ where: { sessionId, summarized: false } });
    if (msgCount >= 20) {
      const toSummarize = await prisma.message.findMany({
        where: { sessionId, summarized: false },
        orderBy: { createdAt: "asc" },
        take: 20,
      });
      const preview = toSummarize.filter(m => m.role === "admin").map(m => m.content.slice(0, 40)).join(" | ");

      const existing = await prisma.document.findFirst({
        where: { masterId, category: "brain", type: "builder_summary" },
      });
      const prevContent = existing?.content ? existing.content.replace(/^📋.*?\n\n/, "") + "\n\n" : "";
      const newContent = `📋 Саммари чата\n\n${prevContent}🆕 ${preview}`;

      if (existing) {
        await prisma.document.update({ where: { id: existing.id }, data: { content: newContent, summary: preview } });
      } else {
        await prisma.document.create({
          data: { masterId, title: "Саммари чата настройки", type: "builder_summary", category: "brain", content: newContent, summary: preview },
        });
      }
      await prisma.message.updateMany({ where: { id: { in: toSummarize.map(m => m.id) } }, data: { summarized: true } });
    }

    emitDone(sessionId);

  } catch (err: unknown) {
    // Check if aborted
    if (err instanceof Error && err.name === "AbortError") {
      emitStopped(sessionId);
      return;
    }

    // Check if cancelled by our flag
    if (err instanceof DOMException && err.name === "AbortError") {
      emitStopped(sessionId);
      return;
    }

    // Real error — notify clients
    const raw = err instanceof Error ? err.message : "errors.processingFailed";
    let message = raw;
    if (raw.includes("Failed to process successful response")) {
      message = "errors.aiResponseFormat";
    }
    console.error("[builder] Error:", raw);
    emitError(sessionId, message);
  } finally {
    endProcessing(sessionId);
    // Clear files used in this processing — they live exactly one run
    if (fileIds.length > 0) removeCachedFiles(fileIds);
    setTimeout(() => clearSession(sessionId), 10_000);
  }
}
