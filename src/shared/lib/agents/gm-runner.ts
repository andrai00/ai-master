import { streamText, isStepCount, isLoopFinished, type ModelMessage, type ToolSet } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { mkdirSync, appendFileSync } from "fs";
import path from "path";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";
import { gmReadDocumentTool } from "./gm-tools/gm-read-document.tool";
import { gmSearchRulesTool } from "./gm-tools/gm-search-rules.tool";
import { gmGetBrainTool } from "./gm-tools/gm-get-brain.tool";
import { gmGetGmNotesTool } from "./gm-tools/gm-get-gm-notes.tool";
import { gmGetSceneStateTool } from "./gm-tools/gm-get-scene-state.tool";
import { gmGetPlayerSheetTool } from "./gm-tools/gm-get-player-sheet.tool";
import { gmCreateDocumentTool } from "./gm-tools/gm-create-document.tool";
import { gmUpdateDocumentTool } from "./gm-tools/gm-update-document.tool";
import { gmUpdateCharSheetTool } from "./gm-tools/gm-update-char-sheet.tool";
import { gmWriteNoteTool } from "./gm-tools/gm-write-note.tool";
import { gmRollDiceTool } from "./gm-tools/gm-roll-dice.tool";
import { gmPersonalRollDiceTool } from "./gm-tools/gm-personal-roll-dice.tool";
import { gmPersonalPresentRollCheckTool } from "./gm-tools/gm-personal-present-roll-check.tool";
import { gmSetSceneStateTool } from "./gm-tools/gm-set-scene-state.tool";
import { gmPresentRollCheckTool } from "./gm-tools/gm-present-roll-check.tool";
import { gmGetRollsTool, gmPersonalGetRollsTool } from "./gm-tools/gm-get-rolls.tool";
import { gmGetPlayersTool } from "./gm-tools/gm-get-players.tool";
import { gmResolveGlossaryLinkTool } from "./gm-tools/gm-resolve-glossary-link.tool";
import { gmDeleteDocumentTool } from "./gm-tools/gm-delete-document.tool";
import { listAllDocumentsTool } from "./tools/list-all-documents.tool";
import { renameDocumentTool } from "./tools/rename-document.tool";
import { gmGlossaryOverviewTool } from "./gm-tools/gm-glossary-overview.tool";
import { clearActions, recordActions, getActions } from "./reply-tools";
import { gmRemoveRollTool, gmConfirmRollsTool } from "./gm-tools/gm-manage-rolls.tool";
import { getChatSummaryTool, updateChatSummaryTool } from "./gm-tools/gm-chat-summary.tool";
import {
  GM_GAME_SYSTEM,
  GM_PERSONAL_SYSTEM,
} from "./gm-system";
import {
  initSession, emitStarted, emitStep, emitDone, emitError,
  emitStopped, emitText,
} from "./step-tracker";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { compressMessages } from "./context-compress";
import { traceAgent, type TraceChat } from "./trace";
import { buildTranscript, persistRun, createRunId, buildStudyJournalContext } from "./transcript";
import { scheduleSummarize } from "./chat-summarizer";

export { emitStopped } from "./step-tracker";

const globalGuard = globalThis as unknown as {
  gmProcessing: Map<string, AbortController>;
};

// Minimal file log for the game chat GM — lets us inspect the exact
// tool-call order, finish reason and delivery outcome after a run.
let gmLogReady = false;
function gmLog(line: string): void {
  try {
    if (!gmLogReady) {
      mkdirSync(path.join(process.cwd(), "logs"), { recursive: true });
      gmLogReady = true;
    }
    appendFileSync(path.join(process.cwd(), "logs", "gm-game.log"), `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // logging must never break the agent
  }
}

function getGuard(): Map<string, AbortController> {
  if (!globalGuard.gmProcessing) globalGuard.gmProcessing = new Map();
  return globalGuard.gmProcessing;
}

function startProcessing(sessionId: string): AbortController | null {
  const g = getGuard();
  if (g.has(sessionId)) return null;
  const ac = new AbortController();
  g.set(sessionId, ac);
  return ac;
}

function endProcessing(sessionId: string): void {
  getGuard().delete(sessionId);
}

export function stopProcessing(sessionId: string): void {
  const g = getGuard();
  const ac = g.get(sessionId);
  if (ac) ac.abort();
  g.delete(sessionId);
}

/** True while a GM generation is running for this session. Used by send
 * actions to reject new messages during processing. */
export function isProcessing(sessionId: string): boolean {
  return getGuard().has(sessionId);
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

const PROVIDER_DEFAULTS: Record<string, number> = {
  openai: 128_000,
  anthropic: 200_000,
  google: 1_048_576,
  ollama: 8_192,
};

async function getContextLimit(): Promise<number> {
  const prisma = getPrisma();
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  if (config?.contextLimit && config.contextLimit > 0) return config.contextLimit;
  const provider = config?.provider?.trim() || "custom";
  return PROVIDER_DEFAULTS[provider] ?? 128_000;
}

function makePrepareStep(sessionId: string, chat: TraceChat, phase: string) {
  let cachedLimit = 128_000;
  let limitLoaded = false;

  return async ({ messages: allMsgs, steps }: { messages: ModelMessage[]; steps?: Array<{ toolCalls?: Array<{ toolName?: string }> }> }) => {
    try {
      if (!limitLoaded) {
        cachedLimit = await getContextLimit();
        limitLoaded = true;
      }
    } catch {
      return {};
    }

    // Diagnostic: log the exact prompt the model sees before this step.
    traceAgent({ chat, sessionId, phase, stepIndex: (steps ?? []).length, prompt: JSON.stringify(allMsgs) });

    // Effective compression threshold: 70% of the context limit, capped so
    // compression actually engages on long runs.
    const compressThreshold = Math.min(cachedLimit * 0.7, 24_000);
    return compressMessages({ messages: allMsgs, steps, threshold: compressThreshold }) ?? {};
  };
}

function getGameTools(): ToolSet {
  return {
    search_rules: gmSearchRulesTool,
    glossary_overview: gmGlossaryOverviewTool,
    list_all_documents: listAllDocumentsTool,
    get_brain: gmGetBrainTool,
    get_gm_notes: gmGetGmNotesTool,
    get_scene_state: gmGetSceneStateTool,
    get_player_sheet: gmGetPlayerSheetTool,
    read_document: gmReadDocumentTool,
    create_document: gmCreateDocumentTool,
    update_document: gmUpdateDocumentTool,
    update_char_sheet: gmUpdateCharSheetTool,
    write_note: gmWriteNoteTool,
    roll_dice: gmRollDiceTool,
    set_scene_state: gmSetSceneStateTool,
    present_roll_check: gmPresentRollCheckTool,
    get_rolls: gmGetRollsTool,
    remove_roll: gmRemoveRollTool,
    confirm_rolls: gmConfirmRollsTool,
    get_chat_summary: getChatSummaryTool,
    update_chat_summary: updateChatSummaryTool,
    get_players: gmGetPlayersTool,
    resolve_glossary_link: gmResolveGlossaryLinkTool,
    delete_document: gmDeleteDocumentTool,
    rename_document: renameDocumentTool,
  };
}

function getPersonalTools(): ToolSet {
  return {
    search_rules: gmSearchRulesTool,
    glossary_overview: gmGlossaryOverviewTool,
    list_all_documents: listAllDocumentsTool,
    get_brain: gmGetBrainTool,
    get_gm_notes: gmGetGmNotesTool,
    get_player_sheet: gmGetPlayerSheetTool,
    read_document: gmReadDocumentTool,
    create_document: gmCreateDocumentTool,
    update_document: gmUpdateDocumentTool,
    update_char_sheet: gmUpdateCharSheetTool,
    write_note: gmWriteNoteTool,
    roll_dice: gmPersonalRollDiceTool,
    present_roll_check: gmPersonalPresentRollCheckTool,
    get_rolls: gmPersonalGetRollsTool,
    remove_roll: gmRemoveRollTool,
    confirm_rolls: gmConfirmRollsTool,
    get_chat_summary: getChatSummaryTool,
    update_chat_summary: updateChatSummaryTool,
    resolve_glossary_link: gmResolveGlossaryLinkTool,
    delete_document: gmDeleteDocumentTool,
    rename_document: renameDocumentTool,
  };
}

const EMPTY_RETRY_PROMPT =
  "🛑 Ты закончил, но не написал полный ответ. Напиши полный текст своего ответа.";

async function buildRollsContext(
  prisma: ReturnType<typeof getPrisma>,
  sessionId: string
): Promise<{
  completed: Array<{ role: "user"; content: string }>;
  assigned: Array<{ role: "user"; content: string }>;
  masterRolls: Array<{ role: "user"; content: string }>;
}> {
  const completedRolls = await prisma.roll.findMany({
    where: { sessionId, status: "completed", consumed: false },
    select: { id: true, checkName: true, diceExpression: true, result: true, detail: true, playerId: true, completedAt: true },
    orderBy: { completedAt: "asc" },
    take: 20,
  });
  const assignedRolls = await prisma.roll.findMany({
    where: { sessionId, status: "assigned" },
    select: { id: true, checkName: true, diceExpression: true, playerId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const ids = [
    ...new Set(
      [...completedRolls.map((r) => r.playerId), ...assignedRolls.map((r) => r.playerId)].filter(
        (id): id is string => !!id
      )
    ),
  ];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, login: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.displayName || u.login]));

  // Player completed (unconsumed) rolls become the latest user turn — the model
  // must answer them, not re-assign. They stay unconsumed until the GM calls
  // confirm_rolls, so a result is never silently lost.
  const completed = completedRolls
    .filter((r) => r.playerId)
    .map((r) => {
      const who = nameById.get(r.playerId!) ?? "игрок";
      const detail = r.detail ? ` (${r.detail})` : "";
      return {
        role: "user" as const,
        content: `🆕 🎲 [roll id: ${r.id}] [${who}] бросок «${r.checkName}» (${r.diceExpression}) → ${r.result}${detail}`,
      };
    });

  // Master completed rolls (playerId = null) are the GM's OWN dice results via
  // roll_dice — context ONLY (no 🆕).
  const masterRolls = completedRolls
    .filter((r) => !r.playerId)
    .map((r) => {
      const detail = r.detail ? ` (${r.detail})` : "";
      return {
        role: "user" as const,
        content: `🎲 [roll id: ${r.id}] [твой бросок (GM)] «${r.checkName}» (${r.diceExpression}) → ${r.result}${detail}`,
      };
    });

  // Assigned (not yet rolled) rolls are context — the model must know they
  // are still pending and may keep, cancel (remove_roll) or re-assign them.
  const assigned = assignedRolls.map((r) => {
    const who = r.playerId ? (nameById.get(r.playerId) ?? "игрок") : "Мастер";
    return {
      role: "user" as const,
      content: `⏳ ACTIVE [roll id: ${r.id}] «${r.checkName}» (${r.diceExpression}) — ${who}, не брошен`,
    };
  });

  return { completed, assigned, masterRolls };
}

/**
 * Builds a compact brain summary for the system prompt: the index file
 * content (if present) plus the list of sections with their types and
 * summaries. Injected directly into the context so the model knows the brain
 * structure immediately — get_brain(topic) is then only needed to read a
 * section in full.
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

/**
 * Master memory preload: lists hidden/memory/* sections (title + summary) so
 * the GM knows what it remembers without reading everything. Structure of the
 * sections is defined by the Builder in the brain policy "memory_management".
 */
async function buildMemoryContext(
  prisma: ReturnType<typeof getPrisma>,
  masterId: string
): Promise<string> {
  const docs = await prisma.document.findMany({
    where: {
      masterId,
      category: "game_hidden",
      status: "active",
      path: { startsWith: "hidden/memory/" },
    },
    select: { id: true, title: true, path: true, summary: true },
    orderBy: { updatedAt: "desc" },
  });
  if (docs.length === 0) return "";

  let out = `\n\n## Память мастера (preloaded)\n`;
  for (const d of docs) {
    out += `- ${d.title} [${d.path}]${d.summary ? ` — ${d.summary}` : ""}\n`;
  }
  return out;
}

async function buildGameContext(sessionId: string) {
  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const sess = await getSession();

  // Dynamic context shared by the system prompt: current game, pending rolls,
  // summary, new count, study journal.
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
    dynamic += await buildMemoryContext(prisma, activeGame.currentMasterId);
  }

  const rollsCtx = await buildRollsContext(prisma, sessionId);

  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });

  if (summary?.content) {
    dynamic += `\n\n## Chat History Summary\n${summary.content}\n`;
  } else {
    dynamic += `\n\n## Chat History Summary\n(нет данных — истории старее видимого окна нет)\n`;
  }

  // Detect NEW (unanswered) player/admin messages: newer than the last master reply.
  const msgMeta = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, createdAt: true },
  });
  let lastMasterAt: Date | null = null;
  for (const m of msgMeta) {
    if (m.role === "master" && (!lastMasterAt || m.createdAt > lastMasterAt)) lastMasterAt = m.createdAt;
  }
  const newIds = new Set(
    msgMeta
      .filter((m) => (m.role === "admin" || m.role === "player") && (!lastMasterAt || m.createdAt > lastMasterAt))
      .map((m) => m.id)
  );
  const newCount = newIds.size;

  if (newCount > 0) {
    dynamic += `\n\n🆕 You have ${newCount} NEW message(s) from players that you have NOT answered yet. The conversation below is in chronological order: messages marked 🆕 are NEW and are what you must answer now; messages without 🆕 are PAST history (context only — do not re-respond to them).`;
  } else {
    dynamic += `\n\nAll messages below are PAST history (context only). There is nothing new to answer.`;
  }

  // Full transcript: chat messages + per-run tool calls/results.
  const messages = await buildTranscript(sessionId, {
    markNew: (id) => newIds.has(id),
    userLabel: ({ senderId, senderDisplayName }) => `[${senderDisplayName || senderId} (id: ${senderId})]: `,
  });

  // Pending assigned rolls and own (master) rolls are context first (older
  // state), then completed player rolls as the latest user turns to answer.
  messages.push(...rollsCtx.assigned, ...rollsCtx.masterRolls, ...rollsCtx.completed);

  // Study journal: previously read documents (survives compression).
  dynamic += await buildStudyJournalContext(sessionId, activeGame?.currentMasterId ?? "");

  // Full system prompt (Pass) — the complete operating instructions.
  const system =
    GM_GAME_SYSTEM +
    `\n\nWork in one pass: study what you need (read/search tools), then act (write/roll tools), then write the FINAL reply — the text the players see. Never re-read a document already in your context (brain preload, study journal, this window). The brain is PRELOADED in the context (## Brain (preloaded)) — index + sections. Read it from there; use get_brain(topic) only to read one section in full. Then use search_rules for specific rules (filter by type if needed), get_gm_notes and get_scene_state for game memory, and get_player_sheet for a player's data. Use get_players to track which players are active. Use get_rolls ONLY for old/historical rolls or roll details — completed rolls already appear in the conversation. Use update_chat_summary to save summaries of key events.` +
    dynamic;

  return {
    messages,
    system,
    activeGame,
    masterId: activeGame?.currentMasterId ?? "",
    newCount,
    newUserMessageIds: [...newIds],
    hasCompletedRolls: rollsCtx.completed.length > 0,
    hasPendingRolls: rollsCtx.assigned.length > 0,
  };
}

async function buildPersonalContext(sessionId: string, playerId: string) {
  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const sess = await getSession();

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
  dynamic += `\n- Player ID: ${playerId}\n`;

  if (activeGame) {
    dynamic += await buildBrainContext(prisma, activeGame.currentMasterId);
    dynamic += await buildMemoryContext(prisma, activeGame.currentMasterId);
  }

  const rollsCtx = await buildRollsContext(prisma, sessionId);

  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });

  if (summary?.content) {
    dynamic += `\n\n## Chat History Summary\n${summary.content}\n`;
  } else {
    dynamic += `\n\n## Chat History Summary\n(нет данных — истории старее видимого окна нет)\n`;
  }

  const msgMeta = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, createdAt: true },
  });
  let lastMasterAt: Date | null = null;
  for (const m of msgMeta) {
    if (m.role === "master" && (!lastMasterAt || m.createdAt > lastMasterAt)) lastMasterAt = m.createdAt;
  }
  const newIds = new Set(
    msgMeta
      .filter((m) => (m.role === "admin" || m.role === "player") && (!lastMasterAt || m.createdAt > lastMasterAt))
      .map((m) => m.id)
  );
  const newCount = newIds.size;

  if (newCount > 0) {
    dynamic += `\n\n🆕 You have ${newCount} NEW message(s) from the player that you have NOT answered yet. The conversation below is in chronological order: messages marked 🆕 are NEW and are what you must answer now; messages without 🆕 are PAST history (context only — do not re-respond to them).`;
  } else {
    dynamic += `\n\nAll messages below are PAST history (context only). There is nothing new to answer.`;
  }

  const messages = await buildTranscript(sessionId, {
    markNew: (id) => newIds.has(id),
    userLabel: ({ senderId, senderDisplayName }) => `[${senderDisplayName || senderId} (id: ${senderId})]: `,
  });

  messages.push(...rollsCtx.assigned, ...rollsCtx.masterRolls, ...rollsCtx.completed);

  dynamic += await buildStudyJournalContext(sessionId, activeGame?.currentMasterId ?? "");

  const system =
    GM_PERSONAL_SYSTEM +
    `\n\nWork in one pass: study what you need (read/search tools), then act (write/roll tools), then write the FINAL reply — the text the player will see. Never re-read a document already in your context (brain preload, study journal, this window). The brain is PRELOADED in the context (## Brain (preloaded)) — index + sections. Read it from there; use get_brain(topic) only to read one section in full. Then use search_rules for specific rules (filter by type if needed), get_gm_notes for your hidden notes, and get_player_sheet to read this player's character data. Use get_rolls ONLY for old/historical rolls or roll details — completed rolls already appear in the conversation. Use update_chat_summary to save summaries.` +
    dynamic;

  return {
    messages,
    system,
    activeGame,
    masterId: activeGame?.currentMasterId ?? "",
    newCount,
    newUserMessageIds: [...newIds],
    hasCompletedRolls: rollsCtx.completed.length > 0,
    hasPendingRolls: rollsCtx.assigned.length > 0,
  };
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

function makeRunText(
  sessionId: string,
  opts: {
    model: Awaited<ReturnType<typeof createProvider>>;
    system: string;
    messages: ModelMessage[];
    tools: ToolSet;
    ac: AbortController;
    chat: TraceChat;
    phase: string;
    log: (line: string) => void;
    liveSteps: Array<{ toolCalls?: Array<Record<string, unknown>> }>;
  }
): Promise<{ text: string; steps: TStreamSteps }> {
  const result = streamText({
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools,
    stopWhen: (input) => isLoopFinished()(input) || isStepCount(100)(input),
    abortSignal: opts.ac.signal,
    prepareStep: makePrepareStep(sessionId, opts.chat, opts.phase),
    onChunk: ({ chunk }) => {
      if (chunk.type === "text-delta" && chunk.text) emitText(sessionId, chunk.text);
    },
    onStepFinish: makeStepLogger(sessionId, opts.chat, opts.phase, opts.log, opts.liveSteps),
  });
  return (async () => {
    const text = await result.text;
    const steps = await result.steps;
    return { text, steps };
  })();
}

export async function runGameMasterBatch(sessionId: string): Promise<void> {
  const ac = startProcessing(sessionId);
  if (!ac) return;

  initSession(sessionId);
  clearActions(sessionId);

  let runId = "";
  let userMessageIds: string[] = [];
  const liveSteps: Array<{ toolCalls?: Array<Record<string, unknown>> }> = [];

  try {
    const ctx = await buildGameContext(sessionId);
    if (!ctx.activeGame || ctx.activeGame.mode !== "game") {
      gmLog("SKIP notInGameMode");
      emitError(sessionId, "errors.notInGameMode");
      return;
    }

    const existingMessages = ctx.messages;
    if (existingMessages.length === 0) {
      gmLog("SKIP no messages");
      emitDone(sessionId);
      return;
    }
    userMessageIds = ctx.newUserMessageIds;

    const model = await createProvider();
    const tools = getGameTools();

    emitStarted(sessionId);
    gmLog(`START session=${sessionId} msgs=${existingMessages.length} new=${ctx.newCount} completedRolls=${ctx.hasCompletedRolls} pending=${ctx.hasPendingRolls}`);
    runId = createRunId();

    // Gate — nothing new to act on: no LLM call at all.
    if (ctx.newCount === 0 && !ctx.hasCompletedRolls && !ctx.hasPendingRolls) {
      gmLog("GATE idle — no new msgs/rolls");
      emitDone(sessionId);
      return;
    }

    // Single agentic loop: study → act → reply.
    let gmText: string | null = null;
    let allSteps: TStreamSteps = [];
    const runStart = performance.now();
    try {
      const execResult = await makeRunText(sessionId, {
        model,
        system: ctx.system,
        messages: existingMessages,
        tools,
        ac,
        chat: "game",
        phase: "exec",
        log: gmLog,
        liveSteps,
      });
      allSteps = execResult.steps;
      gmText = execResult.text?.trim() ?? null;
      gmLog(`DONE textLen=${gmText?.length ?? 0} actions=[${getActions(sessionId).join(",")}]`);
    } catch (err) {
      if (isAbortError(err)) {
        gmLog("ABORTED");
        try {
          await persistRun({ sessionId, runId, steps: liveSteps, status: "aborted" });
        } catch (e) {
          gmLog(`persist aborted failed ${e instanceof Error ? e.message : String(e)}`);
        }
        emitStopped(sessionId);
        return;
      }
      throw err;
    }

    // Retry empty reply — only for a real run, never silently.
    if (!gmText) {
      gmLog("RETRY empty reply");
      const retryStart = performance.now();
      const retry = await makeRunText(sessionId, {
        model,
        system: ctx.system,
        messages: [...existingMessages, { role: "user", content: EMPTY_RETRY_PROMPT }],
        tools,
        ac,
        chat: "game",
        phase: "retry",
        log: gmLog,
        liveSteps,
      });
      traceAgent({ chat: "game", sessionId, phase: "retry", elapsedMs: Math.round(performance.now() - retryStart) });
      allSteps = [...allSteps, ...retry.steps];
      gmText = retry.text?.trim() ?? null;
      gmLog(`RETRY done textLen=${gmText?.length ?? 0}`);
    }

    // Last resort — short fallback so the thinking bubble never ends silently.
    if (!gmText) {
      gmText = "Не удалось сформировать ответ. Попробуй ещё раз.";
      gmLog("FALLBACK empty reply");
    }

    if (gmText) {
      const prisma = getPrisma();
      traceAgent({ chat: "game", sessionId, phase: "final", result: gmText, elapsedMs: Math.round(performance.now() - runStart) });
      emitStep(sessionId, "final");
      const created = await prisma.message.create({
        data: {
          sessionId,
          senderId: (await getSession())?.userId ?? "",
          role: "master",
          content: gmText,
        },
      });
      await persistRun({
        sessionId,
        runId,
        steps: allSteps,
        finalMessageId: created.id,
        finalText: gmText,
        userMessageIds,
      });
      broadcastGameEvent("game_message_sent", { sessionId });
      gmLog(`SAVE len=${gmText.length}`);
    }

    scheduleSummarize(ctx.masterId, sessionId);
    gmLog("DONE");
    emitDone(sessionId);

  } catch (err: unknown) {
    if (isAbortError(err)) {
      gmLog("ABORTED");
      emitStopped(sessionId);
      return;
    }
    const message = err instanceof Error ? err.message : "errors.unknownError";
    gmLog(`ERROR ${message}`);
    console.error("[gm-game] ERROR:", message);
    emitError(sessionId, message.startsWith("errors.") ? message : "errors.unknownError");
  } finally {
    endProcessing(sessionId);
  }
}

export async function runGameMasterPersonal(sessionId: string, playerId: string): Promise<void> {
  const ac = startProcessing(sessionId);
  if (!ac) return;

  initSession(sessionId);
  clearActions(sessionId);

  let runId = "";
  let userMessageIds: string[] = [];
  const liveSteps: Array<{ toolCalls?: Array<Record<string, unknown>> }> = [];

  try {
    const ctx = await buildPersonalContext(sessionId, playerId);
    if (!ctx.activeGame || ctx.activeGame.mode !== "game") {
      emitError(sessionId, "errors.notInGameMode");
      return;
    }

    const existingMessages = ctx.messages;
    if (existingMessages.length === 0) {
      emitDone(sessionId);
      return;
    }
    userMessageIds = ctx.newUserMessageIds;

    const model = await createProvider();
    const tools = getPersonalTools();

    emitStarted(sessionId);
    console.log(`[gm-personal] start — session=${sessionId} playerId=${playerId} msgs=${existingMessages.length} new=${ctx.newCount} completedRolls=${ctx.hasCompletedRolls} pending=${ctx.hasPendingRolls}`);
    runId = createRunId();

    // Gate — nothing new to act on: no LLM call at all.
    if (ctx.newCount === 0 && !ctx.hasCompletedRolls && !ctx.hasPendingRolls) {
      console.log("[gm-personal] GATE idle — no new msgs/rolls");
      emitDone(sessionId);
      return;
    }

    let gmText: string | null = null;
    let allSteps: TStreamSteps = [];
    const runStart = performance.now();
    try {
      const execResult = await makeRunText(sessionId, {
        model,
        system: ctx.system,
        messages: existingMessages,
        tools,
        ac,
        chat: "personal",
        phase: "exec",
        log: (l) => console.log(`[gm-personal] ${l}`),
        liveSteps,
      });
      allSteps = execResult.steps;
      gmText = execResult.text?.trim() ?? null;
      console.log(`[gm-personal] EXEC done textLen=${gmText?.length ?? 0}`);
    } catch (err) {
      if (isAbortError(err)) {
        console.log("[gm-personal] ABORTED");
        try {
          await persistRun({ sessionId, runId, steps: liveSteps, status: "aborted" });
        } catch (e) {
          console.error(`[gm-personal] persist aborted failed — ${e instanceof Error ? e.message : String(e)}`);
        }
        emitStopped(sessionId);
        return;
      }
      throw err;
    }

    // Retry empty reply — only for a real run, never silently.
    if (!gmText) {
      console.log("[gm-personal] RETRY empty reply");
      const retryStart = performance.now();
      const retry = await makeRunText(sessionId, {
        model,
        system: ctx.system,
        messages: [...existingMessages, { role: "user", content: EMPTY_RETRY_PROMPT }],
        tools,
        ac,
        chat: "personal",
        phase: "retry",
        log: (l) => console.log(`[gm-personal] ${l}`),
        liveSteps,
      });
      traceAgent({ chat: "personal", sessionId, phase: "retry", elapsedMs: Math.round(performance.now() - retryStart) });
      allSteps = [...allSteps, ...retry.steps];
      gmText = retry.text?.trim() ?? null;
      console.log(`[gm-personal] RETRY done textLen=${gmText?.length ?? 0}`);
    }

    // Last resort — short fallback so the bubble never ends silently.
    if (!gmText) {
      gmText = "Не удалось сформировать ответ. Попробуй ещё раз.";
    }

    if (gmText) {
      const prisma = getPrisma();
      emitStep(sessionId, "final");
      traceAgent({ chat: "personal", sessionId, phase: "final", result: gmText, elapsedMs: Math.round(performance.now() - runStart) });
      const created = await prisma.message.create({
        data: {
          sessionId,
          senderId: (await getSession())?.userId ?? "",
          role: "master",
          content: gmText,
        },
      });
      await persistRun({
        sessionId,
        runId,
        steps: allSteps,
        finalMessageId: created.id,
        finalText: gmText,
        userMessageIds,
      });
      broadcastGameEvent("personal_message_sent", { sessionId });
    }

    scheduleSummarize(ctx.masterId, sessionId);
    emitDone(sessionId);

  } catch (err: unknown) {
    if (isAbortError(err)) {
      emitStopped(sessionId);
      return;
    }
    const message = err instanceof Error ? err.message : "errors.unknownError";
    console.error("[gm-personal] ERROR:", message);
    emitError(sessionId, message.startsWith("errors.") ? message : "errors.unknownError");
  } finally {
    endProcessing(sessionId);
  }
}

function makeStepLogger(
  sessionId: string,
  chat: TraceChat,
  phase: string,
  log?: (line: string) => void,
  liveSteps?: Array<{ toolCalls?: Array<Record<string, unknown>> }>
) {
  return async (event: Record<string, unknown>) => {
    const calls = event.toolCalls as Array<Record<string, unknown>> | undefined;
    if (calls?.length) {
      if (liveSteps) liveSteps.push({ toolCalls: calls });
      recordActions(sessionId, calls as Array<{ toolName?: string }>);
      if (log) log(`STEP tools=[${calls.map((c) => c.toolName).join(",")}]`);
      for (const call of calls) {
        // AI SDK v7 puts tool arguments in `input` (not `args`).
        traceAgent({ chat, sessionId, phase, toolName: call.toolName as string, args: JSON.stringify(call.input ?? call.args ?? {}) });
        emitStep(sessionId, call.toolName as string);
      }
    }
  };
}
