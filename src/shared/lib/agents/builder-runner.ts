import { generateText, isStepCount, isLoopFinished, type StepResult, type ToolSet } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";
import { createDocumentTool } from "./tools/create-document.tool";
import { updateDocumentTool } from "./tools/update-document.tool";
import { readDocumentTool } from "./tools/read-document.tool";
import { listUploadedFilesTool } from "./tools/list-uploaded-files.tool";
import { exploreArchiveTool } from "./tools/explore-archive.tool";
import { readFileTool } from "./tools/read-file.tool";
import { bulkImportTool } from "./tools/bulk-import.tool";
import { deleteUploadedFilesTool } from "./tools/delete-uploaded-files.tool";
import { scanWikiLinksTool } from "./tools/scan-wiki-links.tool";
import { replaceWikiLinksTool } from "./tools/replace-wiki-links.tool";
import { deleteDocumentTool } from "./tools/delete-document.tool";
import { validateLinksTool } from "./tools/validate-links.tool";
import { builderGetSceneStateTool } from "./tools/get-scene-state.tool";
import { builderGetPlayerSheetTool } from "./tools/get-player-sheet.tool";
import {
  initSession, emitStarted, emitStep, emitDone, emitError,
  emitStopping, emitStopped,
} from "./step-tracker";
import { resetCancellation, throwIfCancelled } from "./parse-cancel";
import { getBuilderGuideTool } from "./tools/get-builder-guide.tool";
import { getChatSummaryTool, updateChatSummaryTool } from "./gm-tools/gm-chat-summary.tool";
import { gmSearchRulesTool } from "./gm-tools/gm-search-rules.tool";
import { gmGlossaryOverviewTool } from "./gm-tools/gm-glossary-overview.tool";
import { gmGetBrainTool } from "./gm-tools/gm-get-brain.tool";
import { gmGetGmNotesTool } from "./gm-tools/gm-get-gm-notes.tool";
import { gmGetPlayersTool } from "./gm-tools/gm-get-players.tool";
import { gmResolveGlossaryLinkTool } from "./gm-tools/gm-resolve-glossary-link.tool";
import { clearActions, recordActions } from "./reply-tools";
import { compressMessages } from "./context-compress";
import { buildStudySummary } from "./study-summary";
import { traceAgent } from "./trace";

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

## Document domains — separate logic, don't mix them
- **Правила (glossary)** — the game rules: a huge corpus. NEVER read it wholesale. Search with search_rules by keywords, then read_document on the result.
- **Мозг (brain)** — instructions for the AI Master: an index plus a few sections. Start from get_brain().
- **Игровая память (game_hidden)** — game memory: notes, current scene, state. get_gm_notes() lists notes, get_scene_state() reads the current scene.
- **Данные игроков (game_visible with playerId)** — character sheets and player records. get_player_sheet() lists them; pass a playerId for one player.

## Your current mode: {builderMode}
- **BRAIN mode** — you work with rules and instructions: glossary + brain (read/write). Use search_rules for a rule, get_brain for instructions, and create/update documents.
- **MEMORY mode** — you manage game memory and player data: game_hidden + game_visible (write), all categories (read). Like running the game: first check each player's data (get_player_sheet) and the current scene (get_scene_state) before changing anything.

## Tools
Your available tools are listed in the context for the current mode. Use get_builder_guide(topic) for detailed reference on dice notation, file imports, brain document structure, formulas, document links, or memory mode migrations. Use update_chat_summary to save your progress as a compact summary when the conversation gets long.

## How to assign document types (IMPORTANT)
A document's type is its MEANING — what the entry IS (creature, spell, item, ability, race, class, rule, lore, article...). It is NOT the folder name and NOT where the file came from.
- explore_archive returns a "folders" list: every folder with its FULL path and direct file count, plus a "tree". Decide a type for EACH folder by the MEANING of its contents (use the sample filenames as hints). Different folders get different types.
- Nesting: deeper folders override their parent. "rules/bestiary/" is NOT "rules" — it is a bestiary (monsters). "rules/mechanics/" is rules. "homebrew/spells/" is spells — homebrew/multiverse/rules are SOURCES, not types; the type is the entity, the source stays in the path.
- If a folder's meaning is unclear, pick a reasonable type and flag it to the admin for confirmation.
- bulk_import_to_glossary matches by folder PREFIX (longest match wins): a { "/rules": "rule", "/rules/bestiary": "monster" } map imports everything under /rules as rule EXCEPT /rules/bestiary as monster. You may list parent folders and let specific subfolders override them.

## Working with existing data
- Never delete glossary/brain without admin confirmation
- Never create duplicates — search first
- Fix broken wiki-links after each bulk operation

## Reply style — tools are invisible
- Tool calls (search_rules, get_brain, create_document, update_document, scan_wiki_links, …) are invisible system actions. NEVER describe them in your reply text — no "я нашёл документ", "проверил базу", "создал файл", "заменил ссылки".
- Your reply is ONLY the summary/result the admin needs. What you did with tools is implied; write the outcome, not the system actions.

## Proactive document links
- Always back up your chat answers with clickable wiki-links to the documents you reference: [[<document-id>]] or [[<document-id>|text]].
- Only link GLOSSARY documents (rules) — never brain, game_hidden or game_visible.
- Links ONLY work with the raw document ID (UUID), never with a title. Take the id from search_rules / read_document results or from the document you just created.
- Mentioned a spell, item, class, race, condition or rule? Link it right away — do not wait to be asked.
- Inside documents you create, add [[<id>]] cross-references to related glossary docs.

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

const BUILDER_PLAN_SYSTEM = `You are the Builder in the PLANNING phase. Study the admin's request using ONLY the read-only tools provided — you cannot create, update, delete, import or reply yet.

Procedure:
1. The brain is PRELOADED above (## Brain (preloaded)) — index + section list. Read it directly. If you need a section's full content, call get_brain(topic).
2. Then study what you need with the read-only tools available in your mode (read_document, get_builder_guide, plus your mode's read-only tools). The chat history summary (if any) is already above (## Chat History Summary) — you do NOT need a tool call for it.
3. Use glossary_overview once to see the glossary structure (types + counts) when you need to understand what exists. Use search_rules ONLY when you genuinely need a specific existing rule, mechanic, item, class or duplicate check — do NOT search the glossary proactively "just in case". Read the brain first: it tells you where things live and when a lookup is needed. Never dump or skim the glossary.
4. Decide what must be created/updated and outline the reply.

Do NOT call any write/import tools in this phase. Return only the plan.`;

const PLAN_SYSTEM_PROMPT = `
## Planning phase (Pass 1)
You are in the PLANNING phase. Study the situation (read-only tools only). Do NOT create or update anything yet. Return a short plan (up to ~400 words) in this format:
STUDY: <what you studied> | RECORD: <what and where to write> | REPLY: <outline of the reply>`;

const EXEC_SYSTEM_PROMPT = `

## Execution phase (Pass 2)
Execute the plan strictly. The data you studied in the planning phase is provided above in the "## Study summary" block — do NOT re-read it. Do NOT call read_document / get_brain / get_gm_notes / get_player_sheet / get_scene_state / search_rules again for documents already listed in the summary. Use the tools to write (create/update documents, import, scan/replace links) or read a NEW document that is NOT in the summary — then re-read only that specific one. Create/update documents as planned, then write your FINAL reply — this is the text the admin will see.`;

const EMPTY_RETRY_PROMPT =
  "🛑 Ты закончил, но не написал полный ответ. Напиши полный текст своего ответа.";

/** Read-only tools available in builder Pass 1 — their results may be carried
 * into Pass 2 so the model does not re-read the same data. */
const BUILDER_STUDY_TOOLS = new Set([
  "read_document",
  "get_brain",
  "get_builder_guide",
  "search_rules",
  "glossary_overview",
  "get_chat_summary",
  "get_gm_notes",
  "get_scene_state",
  "get_player_sheet",
  "get_players",
  "resolve_glossary_link",
  "explore_archive",
  "list_uploaded_files",
  "read_file",
  "scan_wiki_links",
  "validate_links",
]);

/** Pass 1 — read-only tools per mode: study and plan. No writes, no deletes. */
function getPlanTools(builderMode: string): ToolSet {
  const shared: ToolSet = {
    search_rules: gmSearchRulesTool,
    glossary_overview: gmGlossaryOverviewTool,
    get_brain: gmGetBrainTool,
    read_document: readDocumentTool,
    get_builder_guide: getBuilderGuideTool,
  };

  if (builderMode === "memory") {
    return {
      ...shared,
      get_gm_notes: gmGetGmNotesTool,
      get_scene_state: builderGetSceneStateTool,
      get_player_sheet: builderGetPlayerSheetTool,
      get_players: gmGetPlayersTool,
      resolve_glossary_link: gmResolveGlossaryLinkTool,
    };
  }

  // brain mode
  return {
    ...shared,
    explore_archive: exploreArchiveTool,
    list_uploaded_files: listUploadedFilesTool,
    read_file: readFileTool,
    scan_wiki_links: scanWikiLinksTool,
    validate_links: validateLinksTool,
  };
}

function getTools(builderMode: string): ToolSet {
  const shared = {
    search_rules: gmSearchRulesTool,
    glossary_overview: gmGlossaryOverviewTool,
    get_brain: gmGetBrainTool,
    read_document: readDocumentTool,
    create_document: createDocumentTool,
    update_document: updateDocumentTool,
    get_builder_guide: getBuilderGuideTool,
    get_chat_summary: getChatSummaryTool,
    update_chat_summary: updateChatSummaryTool,
  };

  if (builderMode === "memory") {
    return {
      ...shared,
      get_gm_notes: gmGetGmNotesTool,
      get_scene_state: builderGetSceneStateTool,
      get_player_sheet: builderGetPlayerSheetTool,
      get_players: gmGetPlayersTool,
      resolve_glossary_link: gmResolveGlossaryLinkTool,
    };
  }

  // brain mode
  return {
    ...shared,
    delete_document: deleteDocumentTool,
    scan_wiki_links: scanWikiLinksTool,
    replace_wiki_links: replaceWikiLinksTool,
    validate_links: validateLinksTool,
    bulk_import_to_glossary: bulkImportTool,
    explore_archive: exploreArchiveTool,
    list_uploaded_files: listUploadedFilesTool,
    read_file: readFileTool,
    delete_uploaded_files: deleteUploadedFilesTool,
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Builds a compact brain summary for the system prompt: the index file
 * content (if present) plus the list of sections with their types and
 * summaries. Preloaded into the context so the planning phase knows the brain
 * structure without a tool call; get_brain(topic) reads a section in full.
 */
async function buildBrainContext(
  prisma: ReturnType<typeof getPrisma>,
  masterId: string
): Promise<string> {
  const docs = await prisma.document.findMany({
    where: { masterId, category: "brain", status: "active" },
    select: { id: true, title: true, type: true, summary: true, content: true },
    orderBy: [{ type: "asc" }, { title: "asc" }],
  });
  if (docs.length === 0) return "";

  const indexDoc = docs.find((d) => d.type === "_index") ?? null;

  let out = `\n\n## Brain (preloaded)\n`;
  if (indexDoc) {
    out += `- Index (${indexDoc.title}): ${indexDoc.content}\n`;
  } else {
    out += `- Index: NOT FOUND (no _index document in brain). Use get_brain() to inspect.\n`;
  }
  const sections = docs.filter((d) => d.id !== indexDoc?.id);
  if (sections.length > 0) {
    out += `- Sections:\n`;
    for (const s of sections) {
      out += `  - ${s.title} [type: ${s.type}]${s.summary ? ` — ${s.summary}` : ""}\n`;
    }
  }
  return out;
}

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

  const toolsNote =
    builderMode === "memory"
      ? `\n\n## Your tools (MEMORY mode)\nget_gm_notes, get_scene_state, get_player_sheet, search_rules, glossary_overview, get_brain, get_players, resolve_glossary_link, read_document, create_document, update_document, get_builder_guide, get_chat_summary, update_chat_summary.`
      : `\n\n## Your tools (BRAIN mode)\nsearch_rules, glossary_overview, get_brain, read_document, create_document, update_document, delete_document, scan_wiki_links, replace_wiki_links, validate_links, bulk_import_to_glossary, explore_archive, list_uploaded_files, read_file, delete_uploaded_files, get_builder_guide, get_chat_summary, update_chat_summary.`;
  systemPrompt += toolsNote;

  // Dynamic context shared by both the full system prompt (Pass 2) and the
  // short planning prompt (Pass 1).
  let dynamic = "";

  if (activeGame) {
    const master = await prisma.master.findUnique({
      where: { id: activeGame.currentMasterId },
      select: { name: true, description: true },
    });
    if (master) {
      dynamic += `\n\n## Current Game\n- Name: ${master.name}\n- Description: ${master.description ?? "none"}\n`;
    }
  }
  if (sess) dynamic += `\n- Admin: ${sess.displayName || sess.login}\n`;

  // Brain structure is preloaded into the prompt so Pass 1 knows the brain
  // layout immediately; get_brain(topic) reads a section in full.
  if (activeGame) {
    dynamic += await buildBrainContext(prisma, activeGame.currentMasterId);
  }

  // Load chat summary to inject into context
  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });

  // Fetch only unsummarized messages (summarized ones are replaced by the summary)
  const recent = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { role: true, content: true, createdAt: true },
  });
  // desc → chronological (oldest first) for the model.
  recent.reverse();

  // Admin messages newer than the last builder reply are NEW (unanswered).
  let lastBuilderAt: Date | null = null;
  for (const m of recent) {
    if (m.role === "builder" && (!lastBuilderAt || m.createdAt > lastBuilderAt)) lastBuilderAt = m.createdAt;
  }
  const newCount = recent.filter(
    (m) => m.role === "admin" && (!lastBuilderAt || m.createdAt > lastBuilderAt)
  ).length;

  if (newCount > 0) {
    dynamic += `\n\n🆕 You have ${newCount} NEW message(s) from the admin that you have NOT answered yet. The conversation below is in chronological order: messages marked 🆕 are NEW and are what you must answer now; messages without 🆕 are PAST history (context only — do not re-respond to them).`;
  } else {
    dynamic += `\n\nAll messages below are PAST history (context only). There is nothing new to answer.`;
  }

  const messages = recent.map((m) => {
    const role = (m.role === "admin" ? "user" : "assistant") as "user" | "assistant";
    const isNew = role === "user" && (!lastBuilderAt || m.createdAt > lastBuilderAt);
    const content = role === "user" ? `${isNew ? "🆕 " : ""}${m.content}` : m.content;
    return { role, content };
  });

  // Prepend summary as a system context message if it exists
  if (summary?.content) {
    dynamic += `\n\n## Chat History Summary\n${summary.content}\n`;
  } else {
    dynamic += `\n\n## Chat History Summary\n(нет данных — истории старее видимого окна нет)\n`;
  }

  // Full prompt for Pass 2 (execution).
  const system = systemPrompt + dynamic;
  // Short prompt for Pass 1 (planning) — study-only, no write/import rules.
  const planSystem = BUILDER_PLAN_SYSTEM + dynamic;

  return { messages, system, planSystem, builderMode };
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
  clearActions(sessionId);
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
    // Effective compression threshold: 70% of the limit, capped so compression
    // actually engages on long runs (a plain 128K × 0.7 never fires).
    const compressThreshold = Math.min(contextLimit * 0.7, 24_000);

    // --- Emit started: all clients see the bubble now ---
    emitStarted(sessionId);
    const isStudy = fileIds.length > 0;
    console.log(`[builder] start — session=${sessionId} mode=${isStudy ? "STUDY" : "CHAT"} fileIds=${fileIds.length} stepLimit=${isStudy ? "none" : "80"}`);

    const tools = getTools(ctx.builderMode);
    const planTools = getPlanTools(ctx.builderMode);

    // Retry loop: up to 5 attempts for transient errors
    const MAX_RETRIES = 5;
    let result: Awaited<ReturnType<typeof generateText<typeof tools>>> | undefined;
    let lastError: unknown;

    const runGenerate = (
      msgs: Array<{ role: "user" | "assistant"; content: string }>,
      sys: string = ctx.system,
      toolSet: ToolSet = tools,
      phase: string = isStudy ? "study" : "chat"
    ): Promise<Awaited<ReturnType<typeof generateText<typeof tools>>>> =>
      generateText({
        model,
        system: sys,
        messages: msgs,
        tools: toolSet,
        stopWhen: fileIds.length > 0 ? isLoopFinished() : isStepCount(100),
          prepareStep: ({ messages: allMsgs, steps: allSteps }) => {
            // Check abort before doing anything
            if (ac.signal.aborted) {
              console.log(`[builder] ABORT SIGNAL TRIGGERED in prepareStep — session=${sessionId}`);
              return {};
            }

            const stepIdx = (allSteps ?? []).length;
            // Diagnostic: log the exact prompt the model sees before this step.
            traceAgent({ chat: "builder", sessionId, phase, stepIndex: stepIdx, prompt: JSON.stringify(allMsgs) });

            // Periodic status log every 10 steps
            if (isStudy || stepIdx % 10 === 0) {
              const totalMsgs = allMsgs.length;
              const totalChars = allMsgs.reduce((s, m) => s + (typeof m.content === "string" ? m.content.length : 0), 0);
              console.log(`[builder] step=${stepIdx} msgs=${totalMsgs} chars=${totalChars} mode=${isStudy ? "STUDY" : "CHAT"}`);
            }

            // --- THRESHOLD-BASED COMPRESSION (shared module) ---
            const compressed = compressMessages({
              messages: allMsgs,
              steps: allSteps,
              threshold: compressThreshold,
            });
            if (compressed) {
              const estimated = allMsgs.reduce((s, m) => s + (typeof m.content === "string" ? m.content.length : 0), 0) / 4;
              console.log(`[builder] Context compressed: ${allMsgs.length}→${compressed.messages.length} msgs, ~${Math.round(estimated/1000)}K→~${Math.round(estimated/compressed.messages.length/1000)}K tokens`);
              return { messages: compressed.messages };
            }
            return {};
          },
          abortSignal: ac.signal,
          onStepFinish: async (event: StepResult<typeof tools>) => {
            const calls = (event as Record<string,unknown>).toolCalls as Array<{ toolName?: string; input?: unknown; args?: unknown }> | undefined;
            if (calls?.length) {
              recordActions(sessionId, calls);
              for (const call of calls) {
                try {
                  // AI SDK v7 puts tool arguments in `input` (not `args`).
                  traceAgent({ chat: "builder", sessionId, phase, toolName: call.toolName, args: JSON.stringify(call.input ?? call.args ?? {}) });
                  emitStep(sessionId, call.toolName as string);
                } catch (e) {
                  console.error(`[builder] onStepFinish tool error — session=${sessionId} tool=${call.toolName} error=${e instanceof Error ? e.message : String(e)}`);
                }
              }
            }
          },
      });

    const runWithRetries = async (
      msgs: Array<{ role: "user" | "assistant"; content: string }>,
      sys: string = ctx.system,
      toolSet: ToolSet = tools,
      phase: string = isStudy ? "study" : "chat"
    ): Promise<Awaited<ReturnType<typeof generateText<typeof tools>>>> => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const attemptStart = performance.now();
        try {
          const r = await runGenerate(msgs, sys, toolSet, phase);
          traceAgent({ chat: "builder", sessionId, phase, result: r.text?.slice(0, 4000), elapsedMs: Math.round(performance.now() - attemptStart) });
          console.log(`[builder] generateText raw result — ${JSON.stringify({ text: r.text?.slice(0, 200), finishReason: (r as unknown as Record<string,unknown>).finishReason, steps: (r as unknown as {steps?: unknown[]}).steps?.length, usage: (r as unknown as Record<string,unknown>).usage })}`);
          return r;
        } catch (err: unknown) {
          lastError = err;
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[builder] retry catch — session=${sessionId} attempt=${attempt} errorName=${err instanceof Error ? err.name : "?"} errorMsg=${errMsg.slice(0, 200)}`);
          traceAgent({ chat: "builder", sessionId, phase, error: errMsg, elapsedMs: Math.round(performance.now() - attemptStart) });

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
      throw lastError; // should never happen
    };

    let builderText: string | null = null;

    if (!isStudy) {
      // CHAT mode: Plan → Execute two passes. Pass 1 uses the SHORT planning
      // prompt and read-only plan tools; Pass 2 gets the full prompt.
      const planResult = await runWithRetries(messages, ctx.planSystem + PLAN_SYSTEM_PROMPT, planTools, "plan");
      const planText = planResult.text?.trim() ?? "";
      console.log(`[builder] PLAN done — session=${sessionId} textLen=${planText.length}`);

      // Carry the data Pass 1 already read into Pass 2 so the model does not
      // re-read the same documents.
      const studySummary = planText
        ? buildStudySummary(planResult.toolResults ?? [], BUILDER_STUDY_TOOLS)
        : "";

      const execResult = await runWithRetries(
        planText
          ? [
              ...messages,
              {
                role: "user",
                content: `## Study summary (из фазы планирования — не перечитывай):\n${studySummary}\n\nВыполни план: ${planText}`,
              },
            ]
          : messages,
        ctx.system + EXEC_SYSTEM_PROMPT,
        tools,
        "exec"
      );
      builderText = execResult.text?.trim() ?? null;
      console.log(`[builder] EXEC done — session=${sessionId} textLen=${builderText?.length ?? 0}`);
    } else {
      // IMPORT/STUDY mode: single long autonomous pass (import logic untouched).
      result = await runWithRetries(messages, ctx.system, tools, "study");
      builderText = result.text?.trim() ?? null;
      console.log(`[builder] STUDY done — session=${sessionId} textLen=${builderText?.length ?? 0}`);
    }

    // The model ended without a reply — re-run once forcing it to deliver.
    if (!builderText) {
      console.log("[builder] RETRY empty reply");
      const retryResult = await runWithRetries([
        ...messages,
        { role: "user", content: EMPTY_RETRY_PROMPT },
      ], ctx.system, tools, "retry");
      builderText = retryResult.text?.trim() ?? null;
    }

    // Last resort — short fallback so the bubble never ends silently.
    if (!builderText) {
      builderText = "Не удалось сформировать ответ. Попробуй ещё раз.";
    }

    if (builderText) {
      const prisma = getPrisma();
      emitStep(sessionId, "final");
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
    const prisma = getPrisma();
    const allUnsummarized = await prisma.message.findMany({
      where: { sessionId, summarized: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true },
    });
    const withText = allUnsummarized.filter(m => m.content.trim().length > 0);
    if (withText.length >= 20) {
      const toSummarize = withText.slice(0, 20);
      await prisma.message.updateMany({
        where: { id: { in: toSummarize.map(m => m.id) } },
        data: { summarized: true },
      });
      emitStep(sessionId, "summarize");
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
  }
}
