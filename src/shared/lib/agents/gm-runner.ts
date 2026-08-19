import { generateText, isStepCount, type ModelMessage, type ToolSet } from "ai";
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
import { clearActions, recordActions, getActions } from "./reply-tools";
import { gmRemoveRollTool, gmConfirmRollsTool } from "./gm-tools/gm-manage-rolls.tool";
import { getChatSummaryTool, updateChatSummaryTool } from "./gm-tools/gm-chat-summary.tool";
import {
  GM_GAME_SYSTEM,
  GM_PERSONAL_SYSTEM,
} from "./gm-system";
import {
  initSession, emitStarted, emitStep, emitDone, emitError,
  emitStopped,
} from "./step-tracker";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { compressMessages } from "./context-compress";

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

function makePrepareStep() {
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

    const compressThreshold = cachedLimit * 0.7;
    return compressMessages({ messages: allMsgs, steps, threshold: compressThreshold }) ?? {};
  };
}

function getGameTools(): ToolSet {
  return {
    search_rules: gmSearchRulesTool,
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
  };
}

function getPersonalTools(): ToolSet {
  return {
    search_rules: gmSearchRulesTool,
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
  };
}

/** Pass 1 — read-only tools: study and plan. No writes, no rolls, no replies. */
function getPlanTools(kind: "game" | "personal"): ToolSet {
  const base: ToolSet = {
    search_rules: gmSearchRulesTool,
    get_brain: gmGetBrainTool,
    get_gm_notes: gmGetGmNotesTool,
    get_player_sheet: gmGetPlayerSheetTool,
    read_document: gmReadDocumentTool,
    get_rolls: kind === "game" ? gmGetRollsTool : gmPersonalGetRollsTool,
    get_chat_summary: getChatSummaryTool,
    resolve_glossary_link: gmResolveGlossaryLinkTool,
  };
  if (kind === "game") {
    return {
      ...base,
      get_scene_state: gmGetSceneStateTool,
      get_players: gmGetPlayersTool,
    };
  }
  return base;
}

const GM_PLAN_SYSTEM = `You are a Game Master in the PLANNING phase. Study the situation using ONLY the read-only tools provided — you cannot write, assign rolls, or reply yet.

Procedure:
1. Read your brain index FIRST (get_brain) — it tells you how to run THIS game, where things live, and what to check. The brain itself usually answers most questions: what to do, how to resolve actions, where the needed info is kept.
2. Then study your game memory and the relevant data: get_gm_notes / get_scene_state (memory), get_player_sheet (the player's data), get_rolls (rolls), get_chat_summary (history). These cover the situation as it actually is.
3. Use search_rules ONLY when you genuinely need a specific rule's number, mechanic, spell, item, class or condition — and your brain/memory did not already answer it. Do NOT search the glossary proactively "just in case": read the brain first, it tells you when a rule lookup is needed and where it lives. Never dump or skim the glossary.
4. Decide what must be written/updated, which rolls are needed, and outline the reply.

## Sources
Every result is tagged with "source": glossary (rules — shareable), game_visible (that player's data — shareable with them), game_hidden (YOUR secrets — never reveal directly, only through story), brain (instructions — never quote), rolls (results — acknowledge), players, chat_summary. Plan only what may be told; keep game_hidden facts hidden.

Do NOT call any write/roll tools in this phase. Return only the plan.`;

const GM_PLAN_SYSTEM_PERSONAL = `You are a Game Master in a PRIVATE chat, in the PLANNING phase. Study the situation using ONLY the read-only tools provided — you cannot write, assign rolls, or reply yet.

Procedure:
1. Read your brain index FIRST (get_brain) — it tells you how to run THIS game and what to check. The brain itself usually answers most questions: what to do, how to resolve actions, where the needed info is kept.
2. Then study this player's data and your memory: get_player_sheet (no argument), get_rolls, get_chat_summary, get_gm_notes. These cover the situation as it actually is.
3. Use search_rules ONLY when you genuinely need a specific rule's number, mechanic, spell, item, class or condition — and your brain/memory did not already answer it. Do NOT search the glossary proactively "just in case": read the brain first, it tells you when a rule lookup is needed and where it lives. Never dump or skim the glossary.
4. Decide what must be written/updated, which rolls are needed, and outline the reply.

## Sources
Every result is tagged with "source": glossary (rules — shareable), game_visible (this player's data — shareable with them), game_hidden (YOUR secrets — never reveal directly, only through story), brain (instructions — never quote), rolls (results — acknowledge), chat_summary. Plan only what may be told; keep game_hidden facts hidden.

Do NOT call any write/roll tools in this phase. Return only the plan.`;

const PLAN_SYSTEM_PROMPT = `
## Planning phase (Pass 1)
You are in the PLANNING phase. Study the situation (brain index FIRST, then the documents you need). Do NOT write anything, do NOT issue rolls, do NOT answer in the chat. Return a short plan (up to ~400 words) in this format:
STUDY: <what you studied> | RECORD: <what and where to write> | ROLLS: <which rolls to assign> | REPLY: <outline of the reply>`;

const EXEC_SYSTEM_PROMPT = `

## Execution phase (Pass 2)
Execute the plan strictly. Write memory/character sheet as planned, issue the planned rolls (present_roll_check), then write your FINAL reply — this is the text the player will see.`;

const IDLE_USER_PROMPT =
  "Новых сообщений и бросков нет. Не придумывай действия — кратко спроси игрока, что он хочет делать.";

const EMPTY_RETRY_PROMPT =
  "🛑 Ты закончил, но не написал полный ответ. Напиши полный текст своего ответа.";

async function buildRollsContext(
  prisma: ReturnType<typeof getPrisma>,
  sessionId: string
): Promise<{ completed: Array<{ role: "user"; content: string }>; note: string }> {
  const completedRolls = await prisma.roll.findMany({
    where: { sessionId, status: "completed", consumed: false },
    select: { id: true, checkName: true, diceExpression: true, result: true, detail: true, playerId: true, completedAt: true },
    orderBy: { completedAt: "asc" },
    take: 10,
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

  // Completed (unconsumed) rolls become the latest user turn — the model must
  // answer them, not re-assign. They stay unconsumed until the GM calls
  // confirm_rolls, so a result is never silently lost.
  const completed = completedRolls.map((r) => {
    const who = r.playerId ? (nameById.get(r.playerId) ?? "игрок") : "Мастер";
    // Include `detail` (the per-die breakdown the player sees on hover) so
    // the GM knows WHICH dice were rolled — e.g. a natural 20 vs a boosted
    // result, or which die in a pool succeeded.
    const detail = r.detail ? ` (${r.detail})` : "";
    return {
      role: "user" as const,
      content: `🆕 🎲 [${who}] бросок «${r.checkName}» (${r.diceExpression}) → ${r.result}${detail}`,
    };
  });

  let note = "";
  if (assignedRolls.length > 0) {
    note = `\n\n⚠️ WAITING FOR ROLLS (assigned, not yet rolled):\n`
      + assignedRolls
        .map((r) => {
          const who = r.playerId ? (nameById.get(r.playerId) ?? "игрок") : "Мастер";
          return `- "${r.checkName}" (${r.diceExpression}) — ${who}`;
        })
        .join("\n");
  }

  return { completed, note };
}

async function buildGameContext(sessionId: string) {
  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const sess = await getSession();

  // Dynamic context shared by both the full system prompt (Pass 2) and the
  // short planning prompt (Pass 1): current game, pending rolls, summary, new count.
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

  const rollsCtx = await buildRollsContext(prisma, sessionId);
  if (rollsCtx.note) dynamic += rollsCtx.note;

  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });

  if (summary?.content) {
    dynamic += `\n\n## Chat History Summary\n${summary.content}\n`;
  }

  const recent = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    take: 30,
    select: {
      role: true,
      content: true,
      senderId: true,
      createdAt: true,
      sender: { select: { displayName: true } },
    },
  });

  // Messages from players newer than the last master reply are NEW (unanswered).
  let lastMasterAt: Date | null = null;
  for (const m of recent) {
    if (m.role === "master" && (!lastMasterAt || m.createdAt > lastMasterAt)) lastMasterAt = m.createdAt;
  }
  const newCount = recent.filter(
    (m) => (m.role === "admin" || m.role === "player") && (!lastMasterAt || m.createdAt > lastMasterAt)
  ).length;

  if (newCount > 0) {
    dynamic += `\n\n🆕 You have ${newCount} NEW message(s) from players that you have NOT answered yet — process them in this response. Messages marked with 🆕 below are new.`;
  }

  const messages = recent.map((m) => {
    const role = (m.role === "admin" || m.role === "player" ? "user" : "assistant") as "user" | "assistant";
    const isNew =
      role === "user" && (!lastMasterAt || m.createdAt > lastMasterAt);
    const prefix = role === "user"
      ? `${isNew ? "🆕 " : ""}[${m.sender?.displayName || m.senderId} (id: ${m.senderId})]: `
      : "";
    return { role, content: `${prefix}${m.content}` };
  });

  // Completed rolls are the player's latest action — append as the last user turns.
  messages.push(...rollsCtx.completed);

  // Full prompt for Pass 2 (execution) — the complete operating instructions.
  const system =
    GM_GAME_SYSTEM +
    `\n\nPriority: read get_brain FIRST — your operating instructions tell you how to run this game and how to use the glossary for THIS system. Then use search_rules for specific rules, get_gm_notes and get_scene_state for game memory, and get_player_sheet for a player's data. Use get_rolls to check roll results. Use get_players to track which players are active. Use update_chat_summary to save summaries of key events.` +
    dynamic;

  // Short prompt for Pass 1 (planning) — study-only, no write/roll rules needed.
  const planSystem = GM_PLAN_SYSTEM + dynamic;

  return {
    messages,
    system,
    planSystem,
    activeGame,
    masterId: activeGame?.currentMasterId ?? "",
    newCount,
    hasCompletedRolls: rollsCtx.completed.length > 0,
  };
}

async function buildPersonalContext(sessionId: string, playerId: string) {
  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const sess = await getSession();

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
  dynamic += `\n- Player ID: ${playerId}\n`;

  const rollsCtx = await buildRollsContext(prisma, sessionId);
  if (rollsCtx.note) dynamic += rollsCtx.note;

  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });

  if (summary?.content) {
    dynamic += `\n\n## Chat History Summary\n${summary.content}\n`;
  }

  const recent = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { role: true, content: true, senderId: true, createdAt: true },
  });

  // The player's messages newer than the last master reply are NEW (unanswered).
  let lastMasterAt: Date | null = null;
  for (const m of recent) {
    if (m.role === "master" && (!lastMasterAt || m.createdAt > lastMasterAt)) lastMasterAt = m.createdAt;
  }
  const newCount = recent.filter(
    (m) => (m.role === "admin" || m.role === "player") && (!lastMasterAt || m.createdAt > lastMasterAt)
  ).length;

  if (newCount > 0) {
    dynamic += `\n\n🆕 You have ${newCount} NEW message(s) from the player that you have NOT answered yet — process them in this response. Messages marked with 🆕 below are new.`;
  }

  const messages = recent.map((m) => {
    const role = (m.role === "admin" || m.role === "player" ? "user" : "assistant") as "user" | "assistant";
    const isNew = role === "user" && (!lastMasterAt || m.createdAt > lastMasterAt);
    const prefix = role === "user" ? `${isNew ? "🆕 " : ""}[${m.senderId}]: ` : "";
    return { role, content: `${prefix}${m.content}` };
  });

  // Completed rolls are the player's latest action — append as the last user turns.
  messages.push(...rollsCtx.completed);

  // Full prompt for Pass 2 (execution) — the complete operating instructions.
  const system =
    GM_PERSONAL_SYSTEM +
    `\n\nPriority: read get_brain FIRST — your operating instructions tell you how to run this game and how to use the glossary for THIS system. Then use search_rules for specific rules, get_gm_notes for your hidden notes, and get_player_sheet to read this player's character data. Use get_rolls to check this player's roll results. Use update_chat_summary to save summaries.` +
    dynamic;

  // Short prompt for Pass 1 (planning) — study-only, no write/roll rules needed.
  const planSystem = GM_PLAN_SYSTEM_PERSONAL + dynamic;

  return {
    messages,
    system,
    planSystem,
    activeGame,
    masterId: activeGame?.currentMasterId ?? "",
    newCount,
    hasCompletedRolls: rollsCtx.completed.length > 0,
  };
}

async function autoSummarize(sessionId: string): Promise<void> {
  const prisma = getPrisma();
  const allUnsummarized = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true },
  });
  const withText = allUnsummarized.filter(m => m.content.trim().length > 0);
  if (withText.length < 20) return;

  const toSummarize = withText.slice(0, 20);

  await prisma.message.updateMany({
    where: { id: { in: toSummarize.map(m => m.id) } },
    data: { summarized: true },
  });
}

export async function runGameMasterBatch(sessionId: string): Promise<void> {
  const ac = startProcessing(sessionId);
  if (!ac) return;

  initSession(sessionId);
  clearActions(sessionId);

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

    const model = await createProvider();
    const planTools = getPlanTools("game");
    const tools = getGameTools();

    emitStarted(sessionId);
    gmLog(`START session=${sessionId} msgs=${existingMessages.length} new=${ctx.newCount} completedRolls=${ctx.hasCompletedRolls}`);

    let gmText: string | null = null;

    // Gate — nothing new to act on: one short call, no planning pass.
    // Read-only tools: the model must not invent actions or write anything.
    if (ctx.newCount === 0 && !ctx.hasCompletedRolls) {
      gmLog("GATE idle — no new msgs/rolls");
      const idle = await generateText({
        model,
        system: ctx.system,
        messages: [...existingMessages, { role: "user", content: IDLE_USER_PROMPT }],
        tools: planTools,
        stopWhen: isStepCount(10),
        abortSignal: ac.signal,
        prepareStep: makePrepareStep(),
        onStepFinish: makeStepLogger(sessionId, gmLog),
      });
      gmText = idle.text?.trim() ?? null;
    } else {
      // Pass 1 — study and plan (read-only tools). Uses the SHORT planning
      // prompt; the full operating instructions are only needed in Pass 2.
      gmLog("PLAN start");
      const planResult = await generateText({
        model,
        system: ctx.planSystem + PLAN_SYSTEM_PROMPT,
        messages: existingMessages,
        tools: planTools,
        stopWhen: isStepCount(20),
        abortSignal: ac.signal,
        prepareStep: makePrepareStep(),
        onStepFinish: makeStepLogger(sessionId, gmLog),
      });
      const planText = planResult.text?.trim() ?? "";
      gmLog(`PLAN done textLen=${planText.length}`);

      // Pass 2 — execute the plan (full tools). Empty plan is fine — run
      // without injection rather than failing.
      gmLog("EXEC start");
      const execResult = await generateText({
        model,
        system: ctx.system + EXEC_SYSTEM_PROMPT,
        messages: planText
          ? [...existingMessages, { role: "user", content: `Выполни план: ${planText}` }]
          : existingMessages,
        tools,
        stopWhen: isStepCount(100),
        abortSignal: ac.signal,
        prepareStep: makePrepareStep(),
        onStepFinish: makeStepLogger(sessionId, gmLog),
      });
      gmText = execResult.text?.trim() ?? null;
      gmLog(`EXEC done textLen=${gmText?.length ?? 0} actions=[${getActions(sessionId).join(",")}]`);
    }

    // Retry empty reply — only for a real run (Pass 2 / idle), never silently.
    if (!gmText) {
      gmLog("RETRY empty reply");
      const retry = await generateText({
        model,
        system: ctx.system,
        messages: [...existingMessages, { role: "user", content: EMPTY_RETRY_PROMPT }],
        tools,
        stopWhen: isStepCount(100),
        abortSignal: ac.signal,
        prepareStep: makePrepareStep(),
        onStepFinish: makeStepLogger(sessionId, gmLog),
      });
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
      await prisma.message.create({
        data: {
          sessionId,
          senderId: (await getSession())?.userId ?? "",
          role: "master",
          content: gmText,
        },
      });
      broadcastGameEvent("game_message_sent", { sessionId });
      gmLog(`SAVE len=${gmText.length}`);
    }

    await autoSummarize(sessionId);
    gmLog("DONE");
    emitDone(sessionId);

  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "AbortError" || err.message === "errors.cancelled")) {
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

    const model = await createProvider();
    const planTools = getPlanTools("personal");
    const tools = getPersonalTools();

    emitStarted(sessionId);
    console.log(`[gm-personal] start — session=${sessionId} playerId=${playerId} msgs=${existingMessages.length} new=${ctx.newCount} completedRolls=${ctx.hasCompletedRolls}`);

    let gmText: string | null = null;

    // Gate — nothing new to act on: one short call, no planning pass.
    // Read-only tools: the model must not invent actions or write anything.
    if (ctx.newCount === 0 && !ctx.hasCompletedRolls) {
      console.log("[gm-personal] GATE idle — no new msgs/rolls");
      const idle = await generateText({
        model,
        system: ctx.system,
        messages: [...existingMessages, { role: "user", content: IDLE_USER_PROMPT }],
        tools: planTools,
        stopWhen: isStepCount(10),
        abortSignal: ac.signal,
        prepareStep: makePrepareStep(),
        onStepFinish: makeStepLogger(sessionId, (l) => console.log(`[gm-personal] ${l}`)),
      });
      gmText = idle.text?.trim() ?? null;
    } else {
      // Pass 1 — study and plan (read-only tools). Uses the SHORT planning
      // prompt; the full operating instructions are only needed in Pass 2.
      console.log("[gm-personal] PLAN start");
      const planResult = await generateText({
        model,
        system: ctx.planSystem + PLAN_SYSTEM_PROMPT,
        messages: existingMessages,
        tools: planTools,
        stopWhen: isStepCount(20),
        abortSignal: ac.signal,
        prepareStep: makePrepareStep(),
        onStepFinish: makeStepLogger(sessionId, (l) => console.log(`[gm-personal] ${l}`)),
      });
      const planText = planResult.text?.trim() ?? "";
      console.log(`[gm-personal] PLAN done textLen=${planText.length}`);

      // Pass 2 — execute the plan (full tools).
      console.log("[gm-personal] EXEC start");
      const execResult = await generateText({
        model,
        system: ctx.system + EXEC_SYSTEM_PROMPT,
        messages: planText
          ? [...existingMessages, { role: "user", content: `Выполни план: ${planText}` }]
          : existingMessages,
        tools,
        stopWhen: isStepCount(100),
        abortSignal: ac.signal,
        prepareStep: makePrepareStep(),
        onStepFinish: makeStepLogger(sessionId, (l) => console.log(`[gm-personal] ${l}`)),
      });
      gmText = execResult.text?.trim() ?? null;
      console.log(`[gm-personal] EXEC done textLen=${gmText?.length ?? 0}`);
    }

    // Retry empty reply — only for a real run, never silently.
    if (!gmText) {
      console.log("[gm-personal] RETRY empty reply");
      const retry = await generateText({
        model,
        system: ctx.system,
        messages: [...existingMessages, { role: "user", content: EMPTY_RETRY_PROMPT }],
        tools,
        stopWhen: isStepCount(100),
        abortSignal: ac.signal,
        prepareStep: makePrepareStep(),
        onStepFinish: makeStepLogger(sessionId, (l) => console.log(`[gm-personal] ${l}`)),
      });
      gmText = retry.text?.trim() ?? null;
    }

    // Last resort — short fallback so the bubble never ends silently.
    if (!gmText) {
      gmText = "Не удалось сформировать ответ. Попробуй ещё раз.";
    }

    if (gmText) {
      const prisma = getPrisma();
      await prisma.message.create({
        data: {
          sessionId,
          senderId: (await getSession())?.userId ?? "",
          role: "master",
          content: gmText,
        },
      });
      broadcastGameEvent("personal_message_sent", { sessionId });
    }

    await autoSummarize(sessionId);
    emitDone(sessionId);

  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "AbortError" || err.message === "errors.cancelled")) {
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

function makeStepLogger(sessionId: string, log?: (line: string) => void) {
  return async (event: Record<string, unknown>) => {
    const calls = event.toolCalls as Array<{ toolName?: string }> | undefined;
    if (calls?.length) {
      recordActions(sessionId, calls);
      if (log) log(`STEP tools=[${calls.map((c) => c.toolName).join(",")}]`);
      for (const call of calls) {
        emitStep(sessionId, call.toolName as string);
      }
    }
  };
}
