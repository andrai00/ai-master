import { generateText, isStepCount, isLoopFinished, type StepResult, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";
import { createDocumentTool } from "./tools/create-document.tool";
import { updateDocumentTool } from "./tools/update-document.tool";
import { readDocumentTool } from "./tools/read-document.tool";
import { searchDocumentsTool } from "./tools/search-documents.tool";
import { listUploadedFilesTool } from "./tools/list-uploaded-files.tool";
import { exploreArchiveTool } from "./tools/explore-archive.tool";
import { readFileTool } from "./tools/read-file.tool";
import { bulkImportTool } from "./tools/bulk-import.tool";
import { deleteUploadedFilesTool } from "./tools/delete-uploaded-files.tool";
import { scanWikiLinksTool } from "./tools/scan-wiki-links.tool";
import { replaceWikiLinksTool } from "./tools/replace-wiki-links.tool";
import { deleteDocumentTool } from "./tools/delete-document.tool";
import { validateLinksTool } from "./tools/validate-links.tool";
import {
  initSession, emitStarted, emitStep, emitDone, emitError,
  emitStopping, emitStopped, clearSession,
} from "./step-tracker";
import { resetCancellation, throwIfCancelled } from "./parse-cancel";
import { getBuilderGuideTool } from "./tools/get-builder-guide.tool";

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
  return `You are the Builder — the agent that sets up an AI Game Master for tabletop RPGs.

## Who you are
You configure the AI Master that will run games. Read rule files → build glossary (rules) → write brain (instructions for AI Master). You don't run the game — you prepare the AI Master.

## How to talk to the admin
- Respond in the admin's language
- Short and to the point, no IDs or technical breakdown
- Propose next steps, don't ask permission
- One response = one task done

## Three kinds of data
| glossary | Source rules (read/write in brain mode) |
| brain | Instructions for AI Master (read/write in brain mode) |
| game_hidden/game_visible | Game memory — character sheets, notes, state (read/write in memory mode) |

## Your current mode: {builderMode}
In Brain mode: read/write glossary+brain. Memory mode: read all, write game_hidden/game_visible only.

## Tools
explore_archive, list_uploaded_files, bulk_import_to_glossary, read_file, search_documents, read_document, create_document, update_document, delete_document, scan_wiki_links, replace_wiki_links, validate_links, delete_uploaded_files, ask_admin, get_builder_guide.

Use get_builder_guide(topic) for detailed reference on dice notation, file imports, brain document structure, formulas, document links, or memory mode migrations.

## Working with existing data
- Never delete glossary/brain without admin confirmation
- Never create duplicates — search first
- Fix broken wiki-links after each bulk operation

## Language
Use the same language as the admin's messages. Auto-detect.

## Key rules
1. Study rules thoroughly before creating brain docs
2. Always import files when asked
3. Don't add unnecessary content — follow the rules
4. Save dies templates in brain (not glossary)
5. Create index docs for navigation
6. Propose next step, don't wait`;
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
    list_uploaded_files: listUploadedFilesTool,
    explore_archive: exploreArchiveTool,
    read_file: readFileTool,
    bulk_import_to_glossary: bulkImportTool,
    delete_uploaded_files: deleteUploadedFilesTool,
    scan_wiki_links: scanWikiLinksTool,
    replace_wiki_links: replaceWikiLinksTool,
    delete_document: deleteDocumentTool,
    create_document: createDocumentTool,
    update_document: updateDocumentTool,
    read_document: readDocumentTool,
    search_documents: searchDocumentsTool,
    validate_links: validateLinksTool,
    get_builder_guide: getBuilderGuideTool,
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

  // Get builder mode for this session
  const builderSession = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { builderMode: true },
  });
  const builderMode = builderSession?.builderMode ?? "brain";
  systemPrompt = systemPrompt.replace("{builderMode}", builderMode);

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

  // Load chat summary to inject into context
  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });

  // Fetch only unsummarized messages (summarized ones are replaced by the summary)
  const recent = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { role: true, content: true },
  });

  const messages = recent.map((m) => ({
    role: (m.role === "admin" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  // Prepend summary as a system context message if it exists
  if (summary?.content) {
    systemPrompt += `\n\n## Chat History Summary\n${summary.content}\n`;
  }

  return { messages, system: systemPrompt };
}

// ---------------------------------------------------------------------------
// Background runner — no return value, drives SSE events
// ---------------------------------------------------------------------------

function classifyError(err: unknown): string {
  if (!(err instanceof Error)) return "errors.unknownError";
  const msg = err.message;
  const full = `${msg} ${err.stack || ""}`.toLowerCase();

  if (msg.startsWith("errors.")) return msg;

  if (
    full.includes("connection") ||
    full.includes("econnrefused") ||
    full.includes("fetch failed") ||
    full.includes("timeout") ||
    full.includes("timed out") ||
    full.includes("network") ||
    full.includes("enotfound") ||
    full.includes("dns") ||
    full.includes("not responding")
  ) {
    return "errors.modelNotResponding";
  }

  if (
    full.includes("401") ||
    full.includes("403") ||
    full.includes("unauthorized") ||
    full.includes("invalid key") ||
    full.includes("authentication") ||
    full.includes("incorrect api key")
  ) {
    return "errors.aiInvalidKey";
  }

  if (full.includes("429") || full.includes("rate limit") || full.includes("too many requests")) {
    return "errors.aiRateLimited";
  }

  if (msg.includes("Failed to process successful response")) {
    return "errors.aiResponseFormat";
  }

  return "errors.unknownError";
}

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

    if (fileIds.length === 0) {
      ctx.system += "\n\n## Current Mode: CHAT\nNo files are attached. Answer the user's question as a normal assistant.";
    } else {
      ctx.system += "\n\n## Current Mode: IMPORT\nYou are processing uploaded files. Read the IMPORT MODE section below for rules.";
    }

    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId ?? "";

    let fileHint = "";
    if (fileIds.length > 0) {
      const prisma = getPrisma();
      const files = await prisma.uploadedFile.findMany({
        where: { id: { in: fileIds } },
        select: { filename: true },
        orderBy: { createdAt: "asc" },
      });
      const names = files.map((f) => f.filename).join(", ");
      fileHint = `\n\n[Attached files: ${names}. Use list_uploaded_files() to see them and explore_archive() to view directory structure.]`;
    }

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...ctx.messages,
      { role: "user", content: userMessage + fileHint },
    ];

    const model = await createProvider();
    throwIfCancelled();

    // Read context limit from config (with auto-defaults per provider)
    const contextLimit = await getContextLimit();
    const compressThreshold = contextLimit * 0.7; // start compressing at 70%

    // --- Emit started: all clients see the bubble now ---
    emitStarted(sessionId);
    const isStudy = fileIds.length > 0;
    console.log(`[builder] generateText start — session=${sessionId} mode=${isStudy ? "STUDY" : "CHAT"} fileIds=${fileIds.length} stepLimit=${isStudy ? "none" : "80"}`);

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
          stopWhen: fileIds.length > 0 ? isLoopFinished() : isStepCount(80),
          prepareStep: ({ messages: allMsgs, steps: allSteps }) => {
            // Check abort before doing anything
            if (ac.signal.aborted) {
              console.log(`[builder] ABORT SIGNAL TRIGGERED in prepareStep — session=${sessionId}`);
              return {};
            }

            // Count tool calls for summary (used by both compression paths)
            let created = 0, updated = 0, searched = 0, listed = 0;
            for (const s of allSteps ?? []) {
              for (const c of (s.toolCalls ?? [])) {
                switch (c.toolName) {
                  case "create_document": created++; break;
                  case "update_document": updated++; break;
                  case "search_documents": searched++; break;
                  case "list_uploaded_files": listed++; break;
                }
              }
            }

            // Periodic status log every 10 steps
            const stepIdx = (allSteps ?? []).length;
            if (isStudy || stepIdx % 10 === 0) {
              const totalMsgs = allMsgs.length;
              const totalChars = allMsgs.reduce((s, m) => s + (typeof m.content === "string" ? m.content.length : 0), 0);
              console.log(`[builder] step=${stepIdx} msgs=${totalMsgs} chars=${totalChars} created=${created} updated=${updated} mode=${isStudy ? "STUDY" : "CHAT"}`);
            }

            // --- THRESHOLD-BASED COMPRESSION ---
            const totalChars = allMsgs.reduce((s, m) => s + (typeof m.content === "string" ? m.content.length : 0), 0);
            const estimated = totalChars / 4;
            if (estimated < compressThreshold) {
              if (isStudy) console.log(`[builder] prepareStep no-compress — step=${stepIdx} totalMsgs=${allMsgs.length} estimated=${Math.round(estimated)} tokens`);
              return {};
            }

            // Compress: keep system + last admin message + pin last tool step.
            // Summarize everything in between into one message.
            const systemMsg = allMsgs.find(m => m.role === "system");
            const adminMsgs = allMsgs.filter(m => m.role === "user");
            const lastAdmin = adminMsgs[adminMsgs.length - 1];

            // Pin last step (current processing — never compress)
            const lastTool = allMsgs[allMsgs.length - 1];

            const summary = [
              "[Compressed — previous steps]",
              created ? `Created ${created} documents` : "",
              updated ? `Updated ${updated} documents` : "",
              searched ? `Searched ${searched} times` : "",
              listed ? `Listed files ${listed} times` : "",
            ].filter(Boolean).join(". ");

            const compressed: ModelMessage[] = [];
            if (systemMsg) compressed.push(systemMsg as ModelMessage);
            if (lastAdmin) compressed.push(lastAdmin as ModelMessage);
            compressed.push({ role: "assistant" as const, content: summary });
            if (lastTool) compressed.push(lastTool as ModelMessage);

            console.log(`[builder] Context compressed: ${allMsgs.length}→${compressed.length} msgs, ${Math.round(estimated/1000)}K→~${Math.round(totalChars/4/compressed.length/1000)}K tokens`);
            return { messages: compressed };
          },
          abortSignal: ac.signal,
          onStepFinish: async (event: StepResult<typeof tools>) => {
            console.log(`[builder] RAW onStepFinish — ${JSON.stringify({ hasToolCalls: "toolCalls" in event, hasToolResults: "toolResults" in event, keys: Object.keys(event), stepNumber: (event as Record<string,unknown>).stepNumber, finishReason: (event as Record<string,unknown>).finishReason, text: (event as Record<string,unknown>).text })}`);
            const calls = (event as Record<string,unknown>).toolCalls as Array<{ toolName?: string }> | undefined;
            if (calls?.length) {
              for (let i = 0; i < calls.length; i++) {
                try {
                  const call = calls[i];
                  const toolName = call.toolName as string;
                  emitStep(sessionId, toolName);
                } catch (e) {
                  console.error(`[builder] onStepFinish tool error — session=${sessionId} tool=${calls[i]?.toolName} error=${e instanceof Error ? e.message : String(e)}`);
                }
              }
            }
          },
        });
        console.log(`[builder] generateText raw result — ${JSON.stringify({ text: result.text?.slice(0, 200), finishReason: (result as unknown as Record<string,unknown>).finishReason, steps: (result as unknown as {steps?: unknown[]}).steps?.length, usage: (result as unknown as Record<string,unknown>).usage })}`);
        break; // success — exit retry loop
      } catch (err: unknown) {
        lastError = err;
        console.error(`[builder] retry catch — session=${sessionId} attempt=${attempt} errorName=${err instanceof Error ? err.name : "?"} errorMsg=${err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)}`);

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
    const builderText = result.text?.trim();
    const finishReason = (result as unknown as Record<string, unknown>)?.finishReason ?? "unknown";
    const stepArr = (result as unknown as { steps?: Array<unknown> })?.steps;
    console.log(`[builder] generateText done — session=${sessionId} steps=${stepArr?.length ?? "?"} finishReason=${finishReason} textLen=${builderText?.length ?? 0} textPreview=${JSON.stringify(builderText?.slice(0, 200))}`);
    const prisma = getPrisma();

    if (builderText) {
      await prisma.message.create({
        data: {
          sessionId,
          senderId: (await getSession())?.userId ?? "",
          role: "builder",
          content: builderText,
        },
      });
    }

    // Auto-summarize if 20+ unsummarized with text content
    const allUnsummarized = await prisma.message.findMany({
      where: { sessionId, summarized: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true },
    });
    const withText = allUnsummarized.filter(m => m.content.trim().length > 0);
    if (withText.length >= 20) {
      emitStep(sessionId, "summarize");
      throwIfCancelled();

      const toSummarize = withText.slice(0, 20);
      const preview = toSummarize.filter(m => m.role === "admin").map(m => m.content.slice(0, 40)).join(" | ");

      const existing = await prisma.chatSummary.findFirst({
        where: { masterId },
      });
      const prevContent = existing?.content ? existing.content.replace(/^📋.*?\n\n/, "") + "\n\n" : "";
      const newContent = `📋 Chat Summary\n\n${prevContent}🆕 ${preview}`;

      if (existing) {
        await prisma.chatSummary.update({ where: { id: existing.id }, data: { content: newContent, preview } });
      } else {
        await prisma.chatSummary.create({
          data: { masterId, content: newContent, preview },
        });
      }
      await prisma.message.updateMany({ where: { id: { in: toSummarize.map(m => m.id) } }, data: { summarized: true } });
    }

    emitDone(sessionId);

  } catch (err: unknown) {
    // Check if aborted
    if (err instanceof Error && err.name === "AbortError") {
      console.log(`[builder] ABORTED — session=${sessionId} name=${err.name} message=${err.message}`);
      emitStopped(sessionId);
      return;
    }

    // Check if cancelled by our flag
    if (err instanceof DOMException && err.name === "AbortError") {
      console.log(`[builder] DOM ABORTED — session=${sessionId}`);
      emitStopped(sessionId);
      return;
    }

    // Real error — notify clients
    const message = classifyError(err);
    console.error(`[builder] ERROR — session=${sessionId} rawMessage=${err instanceof Error ? err.message : String(err)} classified=${message}`);
    emitError(sessionId, message);
  } finally {
    endProcessing(sessionId);
    setTimeout(() => clearSession(sessionId), 10_000);
  }
}
