import { streamText, isStepCount, isLoopFinished, type StepResult, type ToolSet, type ModelMessage } from "ai";
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
import { deleteDocumentTool } from "./tools/delete-document.tool";
import { deleteDocumentsByTypeTool } from "./tools/delete-documents-by-type.tool";
import { builderGetSceneStateTool } from "./tools/get-scene-state.tool";
import { builderGetPlayerSheetTool } from "./tools/get-player-sheet.tool";
import {
  initSession, emitStarted, emitStep, emitDone, emitError,
  emitStopping, emitStopped, emitText,
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
import { listAllDocumentsTool } from "./tools/list-all-documents.tool";
import { renameDocumentTool } from "./tools/rename-document.tool";
import { validateLinksTool } from "./tools/validate-links.tool";
import { clearActions, recordActions } from "./reply-tools";
import { compressMessages } from "./context-compress";
import { traceAgent } from "./trace";
import { buildTranscript, persistRun, createRunId, buildStudyJournalContext } from "./transcript";
import { stepsToModelMessages } from "./run-steps";
import { scheduleSummarize } from "./chat-summarizer";
import { wrapToolSet } from "./tool-output";

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

Думай быстрее: не затягивай анализ, действуй сразу и отвечай коротко.

## How to work — one pass
- Study first: read/search what you need (read_document, search_rules, get_brain, get_gm_notes, get_player_sheet, get_scene_state, explore_archive).
- Then act with write/import tools. Then write the FINAL reply — the text the admin sees.
- Never re-read a document you have already read in this conversation — it is in your context. Re-read only something genuinely new or changed.
- If a document you read contains a link [[path|...]] and you need its content — open it with read_document("<path>").
- No planning report: tools and reads are invisible. Your reply is only the result.

## Answering rules questions — brain first, glossary when needed
- Only questions ABOUT the game's rules need grounding. Casual/meta questions ("кто ты", привет, планы, админ-разговоры) — answer directly, no search.
- For a rules question: 1) the brain (preloaded in context, get_brain for a section), 2) the glossary (search_rules) when the brain lacks the answer or specifics are needed — a rare rule, an item, a complete list (archetypes, spells, feats), a homebrew variant.
- Do NOT search the glossary for common/hot rules already in the brain — answer from the brain.
- For a rules question you MUST ground it: the brain has it, OR you call search_rules and read the relevant docs. Search/read calls are visible to the admin — that is expected and good.
- You may call search_rules in THIS turn even if you searched the same topic earlier — a fresh search confirms current data and beats guessing.
- NEVER fall back to general knowledge (SRD) for a rules question without having called search_rules (or read_document) in THIS turn and found nothing useful.
- Search found nothing? Try another query first (shorter, other language, drop the type filter) before giving up.
- Only if searches keep returning nothing — say honestly "в глоссарии не нашёл по этому запросу", then give general knowledge as a clearly-marked fallback.

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
- Fix broken links by pointing them to existing documents; archive-style md links (/bestiary/331-camel.md) resolve automatically — do NOT rewrite them
- Never wrap markdown sections in code fences with language "markdown"/"md" — use plain headings/tables. Formulas go ONLY in a single "formula" code block at the TOP of the sheet: base inputs (name: number) + derived formulas (name = expression); inline values in the body use $name and auto-substitute. Formula errors show as "err" — never guess. After create_document/update_document check the returned formulaValidation and fix any formula errors

## Reply style — tools are invisible
- Tool calls (search_rules, get_brain, create_document, update_document, …) are invisible system actions. NEVER describe them in your reply text — no "я нашёл документ", "проверил базу", "создал файл", "заменил ссылки".
- Your reply is ONLY the summary/result the admin needs. What you did with tools is implied; write the outcome, not the system actions.

## Proactive document links
- Always back up your chat answers with clickable wiki-links to the documents you reference: [[<path>|text]] or [[<path>]].
- Links resolve by the unique document PATH with the category prefix, e.g. [[glossary/bestiary/331-camel|Верблюд]], [[brain/routing/main-router]]. Take paths from search_rules / read_document / list_all_documents results — never invent one.
- Only link GLOSSARY documents (rules) in chat — never brain, game_hidden or game_visible.
- Mentioned a spell, item, class, race, condition or rule? Link it right away — do not wait to be asked.
- Inside documents you create, add [[<path>]] cross-references to related docs (glossary from brain/hidden; per the allowed-target rules).
- To point at a specific SECTION, append #heading with the exact heading text from the target document's toc (read_document returns it): [[glossary/spells/98-sleep#улучшения|Усыпление]]. Bad anchors are reported as anchor-not-found in linkValidation — fix them.

## Renaming and path safety
- Never change a path via update_document. To rename a document use rename_document — it updates ALL links to it automatically.
- create_document rejects a busy path (title or path already exists) — choose another path or update the existing document explicitly.

## Language
Use the same language as the admin's messages. Auto-detect.

## Key rules
1. Study rules thoroughly before creating brain docs
2. Always import files when asked
3. Don't add unnecessary content — follow the rules
4. Save dies templates in brain (not glossary)
5. Create index docs for navigation
6. Propose next step, don't wait
7. After studying the rules, create a brain section "Память мастера" (type: memory_management) describing how the master should maintain hidden/memory/ for THIS game: which sections (players, scenes, decisions...), when to write, when to archive old scenes into history.`;
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

function getTools(builderMode: string): ToolSet {
  const shared = {
    search_rules: gmSearchRulesTool,
    glossary_overview: gmGlossaryOverviewTool,
    get_brain: gmGetBrainTool,
    read_document: readDocumentTool,
    list_all_documents: listAllDocumentsTool,
    create_document: createDocumentTool,
    update_document: updateDocumentTool,
    get_builder_guide: getBuilderGuideTool,
    get_chat_summary: getChatSummaryTool,
    update_chat_summary: updateChatSummaryTool,
    rename_document: renameDocumentTool,
    validate_links: validateLinksTool,
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
    delete_documents_by_type: deleteDocumentsByTypeTool,
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
 * summaries. Preloaded into the context so the model knows the brain
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
      : `\n\n## Your tools (BRAIN mode)\nsearch_rules, glossary_overview, get_brain, read_document, create_document, update_document, delete_document, delete_documents_by_type, bulk_import_to_glossary, explore_archive, list_uploaded_files, read_file, delete_uploaded_files, get_builder_guide, get_chat_summary, update_chat_summary.`;
  systemPrompt += toolsNote;

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

  if (activeGame) {
    dynamic += await buildBrainContext(prisma, activeGame.currentMasterId);
  }

  // Load chat summary to inject into context
  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });
  if (summary?.content) {
    dynamic += `\n\n## Chat History Summary\n${summary.content}\n`;
  } else {
    dynamic += `\n\n## Chat History Summary\n(нет данных — истории старее видимого окна нет)\n`;
  }

  // Detect NEW (unanswered) admin messages: newer than the last builder reply.
  const msgMeta = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, createdAt: true },
  });
  let lastBuilderAt: Date | null = null;
  for (const m of msgMeta) {
    if (m.role === "builder" && (!lastBuilderAt || m.createdAt > lastBuilderAt)) lastBuilderAt = m.createdAt;
  }
  const newIds = new Set(
    msgMeta
      .filter((m) => m.role === "admin" && (!lastBuilderAt || m.createdAt > lastBuilderAt))
      .map((m) => m.id)
  );
  const newCount = newIds.size;

  if (newCount > 0) {
    dynamic += `\n\n🆕 You have ${newCount} NEW message(s) from the admin that you have NOT answered yet. The conversation below is in chronological order: messages marked 🆕 are NEW and are what you must answer now; messages without 🆕 are PAST history (context only — do not re-respond to them).`;
  } else {
    dynamic += `\n\nAll messages below are PAST history (context only). There is nothing new to answer.`;
  }

  // Full transcript: chat messages + per-run tool calls/results.
  const messages = await buildTranscript(sessionId, { markNew: (id) => newIds.has(id) });

  // Study journal: previously read documents (survives compression).
  dynamic += await buildStudyJournalContext(sessionId, activeGame?.currentMasterId ?? "");

  const system = systemPrompt + dynamic;

  return {
    messages,
    system,
    builderMode,
    masterId: activeGame?.currentMasterId ?? "",
    newUserMessageIds: [...newIds],
  };
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

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (err instanceof DOMException && err.name === "AbortError") ||
    (err as Error | null)?.message === "errors.cancelled"
  );
}

type TStreamRes = ReturnType<typeof streamText<ToolSet>>;
type TStreamSteps = Awaited<TStreamRes["steps"]>;

const FORCE_ANSWER_PROMPT =
  "Ты уже изучил вопрос и вызывал тулы. СЕЙЧАС НЕ вызывай тулы — напиши ответ прямо, используя то, что уже есть в контексте (результаты поиска и чтения выше). Если конкретного правила нет в контексте — ответь по общим знаниям и честно отметь, что точного правила под рукой нет.";

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

  let runId = "";
  let userMessageIds: string[] = [];
  const liveSteps: Array<{ toolCalls?: Array<Record<string, unknown>> }> = [];

  try {
    // --- Phase: prepare ---
    const ctx = await buildContext(sessionId);
    throwIfCancelled();
    userMessageIds = ctx.newUserMessageIds;

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

    // The user's message is already in the transcript (Message table) — do NOT
    // append it again. For imports, append only the file hint.
    const messages: ModelMessage[] = [...ctx.messages];
    if (fileIds.length > 0) {
      messages.push({ role: "user", content: fileHint.trim() });
    }

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
    console.log(`[builder] start — session=${sessionId} mode=${isStudy ? "STUDY" : "CHAT"} fileIds=${fileIds.length}`);

    const tools = wrapToolSet(getTools(ctx.builderMode));
    runId = createRunId();

    // Retry loop: up to 5 attempts for transient errors
    const MAX_RETRIES = 5;

    const runGenerate = async (
      msgs: ModelMessage[],
      sys: string = ctx.system,
      toolSet: ToolSet = tools
    ): Promise<{ text: string; steps: TStreamSteps; finishReason: string | null }> => {
      const result = streamText({
        model,
        system: sys,
        messages: msgs,
        tools: toolSet,
        stopWhen: (input) =>
          isLoopFinished()(input) || isStepCount(100)(input),
        prepareStep: ({ messages: allMsgs, steps: allSteps }) => {
          // Check abort before doing anything
          if (ac.signal.aborted) {
            return {};
          }


          const stepIdx = (allSteps ?? []).length;
          traceAgent({ chat: "builder", sessionId, phase: "exec", stepIndex: stepIdx, prompt: JSON.stringify(allMsgs) });

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
          const calls = (event as Record<string, unknown>).toolCalls as Array<Record<string, unknown>> | undefined;
          if (calls?.length) {
            liveSteps.push({ toolCalls: calls });
            recordActions(sessionId, calls as Array<{ toolName?: string }>);
            for (const call of calls) {
              try {
                // AI SDK v7 puts tool arguments in `input` (not `args`).
                traceAgent({ chat: "builder", sessionId, phase: "exec", toolName: call.toolName as string, args: JSON.stringify(call.input ?? call.args ?? {}) });
                emitStep(sessionId, call.toolName as string, undefined, JSON.stringify(call.input ?? call.args ?? {}));
              } catch (e) {
                console.error(`[builder] onStepFinish tool error — session=${sessionId} tool=${call.toolName} error=${e instanceof Error ? e.message : String(e)}`);
              }
            }
          }
        },
        onChunk: ({ chunk }) => {
          if (chunk.type === "text-delta" && chunk.text) emitText(sessionId, chunk.text);
        },
      });
      const text = await result.text;
      const steps = await result.steps;
      const finishReason = (await result.finishReason) ?? null;
      return { text, steps, finishReason };
    };

    const runWithRetries = async (
      msgs: ModelMessage[],
      sys: string = ctx.system,
      toolSet: ToolSet = tools
    ): Promise<{ text: string; steps: TStreamSteps; finishReason: string | null }> => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const attemptStart = performance.now();
        try {
          const r = await runGenerate(msgs, sys, toolSet);
          traceAgent({ chat: "builder", sessionId, phase: "exec", result: r.text?.slice(0, 4000), finishReason: r.finishReason ?? undefined, elapsedMs: Math.round(performance.now() - attemptStart) });
          console.log(`[builder] generateText raw result — ${JSON.stringify({ text: r.text?.slice(0, 200), finishReason: (r as unknown as Record<string, unknown>).finishReason, steps: (r as unknown as { steps?: unknown[] }).steps?.length, usage: (r as unknown as Record<string, unknown>).usage })}`);
          return r;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          traceAgent({ chat: "builder", sessionId, phase: "exec", error: errMsg, elapsedMs: Math.round(performance.now() - attemptStart) });
          console.error(`[builder] retry catch — session=${sessionId} attempt=${attempt} errorName=${err instanceof Error ? err.name : "?"} errorMsg=${errMsg.slice(0, 200)}`);

          // Never retry user stop or cancellation
          if (isAbortError(err)) throw err;
          if (errMsg.includes("not configured")) throw err;

          // Last attempt — give up
          if (attempt === MAX_RETRIES) throw err;

          // Emit retry step to SSE
          emitStep(sessionId, "retry", `${attempt + 1}/${MAX_RETRIES}`);
          console.warn(`[builder] Attempt ${attempt} failed, retrying in 1.5s: ${errMsg}`);
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      throw new Error("errors.unknownError"); // should never happen
    };

    // --- Single agentic loop: study → act → reply ---
    let builderText: string | null = null;
    let resultSteps: TStreamSteps = [];

    try {
      const result = await runWithRetries(messages, ctx.system, tools);
      resultSteps = result.steps;
      builderText = result.text?.trim() ?? null;
      console.log(`[builder] DONE — session=${sessionId} textLen=${builderText?.length ?? 0}`);
    } catch (err) {
      if (isAbortError(err)) {
        // Stop: persist what managed to run (aborted, debug-only), start fresh next turn.
        try {
          await persistRun({ sessionId, runId, steps: liveSteps, status: "aborted" });
        } catch (e) {
          console.error(`[builder] persist aborted failed — ${e instanceof Error ? e.message : String(e)}`);
        }
        emitStopped(sessionId);
        return;
      }
      throw err;
    }

    // The model ended without a reply — retry WITHOUT tools, feeding the tool
    // results the main run already collected (rebuilt properly), so it answers
    // FROM the search/read results instead of memory.
    if (!builderText) {
      console.log("[builder] RETRY empty reply — answer from the run's tool results");
      const retryMsgs: ModelMessage[] = [
        ...messages,
        ...stepsToModelMessages(resultSteps),
        { role: "user", content: FORCE_ANSWER_PROMPT },
      ];
      const retryResult = await runWithRetries(retryMsgs, ctx.system, {});
      resultSteps = [...resultSteps, ...retryResult.steps];
      builderText = retryResult.text?.trim() ?? null;
      console.log(`[builder] RETRY done textLen=${builderText?.length ?? 0}`);
    }

    // Last resort — short fallback so the bubble never ends silently.
    if (!builderText) {
      builderText = "Не удалось сформировать ответ. Попробуй ещё раз.";
    }

    // Save the final message + full transcript atomically.
    const prisma = getPrisma();
    emitStep(sessionId, "final");
    const created = await prisma.message.create({
      data: {
        sessionId,
        senderId: (await getSession())?.userId ?? "",
        role: "builder",
        content: builderText,
      },
    });

    await persistRun({
      sessionId,
      runId,
      steps: resultSteps,
      finalMessageId: created.id,
      finalText: builderText,
      userMessageIds,
    });

    // Background auto-summarization when the session grows.
    scheduleSummarize(ctx.masterId, sessionId);

    emitDone(sessionId);

  } catch (err: unknown) {
    if (isAbortError(err)) {
      console.log(`[builder] ABORTED — session=${sessionId} name=${err instanceof Error ? err.name : "?"} message=${err instanceof Error ? err.message : String(err)}`);
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
