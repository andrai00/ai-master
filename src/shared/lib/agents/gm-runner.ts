import { generateText, isStepCount, type ModelMessage } from "ai";
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
import { gmUpdateMemoryTool } from "./gm-tools/gm-update-memory.tool";
import { makeSendReplyTool, makeReviewDraftTool, clearActions, recordActions, getActions } from "./reply-tools";
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

function makePrepareStep(sessionId: string, toolsCount: number) {
  let cachedLimit = 128_000;
  let limitLoaded = false;

  return async ({ messages: allMsgs }: { messages: ModelMessage[] }) => {
    try {
      if (!limitLoaded) {
        cachedLimit = await getContextLimit();
        limitLoaded = true;
      }
    } catch {
      return {};
    }

    const compressThreshold = cachedLimit * 0.7;
    const totalChars = allMsgs.reduce((s, m) => s + (typeof m.content === "string" ? m.content.length : 0), 0);
    if (totalChars / 4 < compressThreshold) return {};

    const systemMsg = allMsgs.find(m => m.role === "system");
    const userMsgs = allMsgs.filter(m => m.role === "user");
    const lastUser = userMsgs[userMsgs.length - 1];
    const lastMsg = allMsgs[allMsgs.length - 1];

    return {
      messages: [
        ...(systemMsg ? [systemMsg] : []),
        ...(lastUser ? [lastUser] : []),
        { role: "assistant" as const, content: `[Compressed — ${toolsCount} tools available. Use get_rolls, search_rules, get_brain and get_player_sheet for context.]` },
        ...(lastMsg && lastMsg !== lastUser ? [lastMsg] : []),
      ].filter(Boolean) as ModelMessage[],
    };
  };
}

function getGameTools(sessionId: string) {
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
    update_memory: gmUpdateMemoryTool,
    send_reply: makeSendReplyTool(sessionId, "master", "game_message_sent"),
    review_draft: makeReviewDraftTool(sessionId, "game"),
  };
}

function getPersonalTools(sessionId: string) {
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
    update_memory: gmUpdateMemoryTool,
    send_reply: makeSendReplyTool(sessionId, "master", "personal_message_sent"),
    review_draft: makeReviewDraftTool(sessionId, "personal"),
  };
}

async function buildRollsContext(
  prisma: ReturnType<typeof getPrisma>,
  sessionId: string
): Promise<{ completed: Array<{ role: "user"; content: string }>; note: string }> {
  const completedRolls = await prisma.roll.findMany({
    where: { sessionId, status: "completed", consumed: false },
    select: { id: true, checkName: true, diceExpression: true, result: true, playerId: true, completedAt: true },
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
    return {
      role: "user" as const,
      content: `🆕 🎲 [${who}] бросок «${r.checkName}» (${r.diceExpression}) → ${r.result}`,
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

  let systemPrompt = GM_GAME_SYSTEM;

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

  systemPrompt += `\n\nPriority: read get_brain FIRST — your operating instructions tell you how to run this game and how to use the glossary for THIS system. Then use search_rules for specific rules, get_gm_notes and get_scene_state for game memory, and get_player_sheet for a player's data. Use get_rolls to check roll results. Use get_players to track which players are active. Use update_chat_summary to save summaries of key events.`;

  const rollsCtx = await buildRollsContext(prisma, sessionId);
  if (rollsCtx.note) systemPrompt += rollsCtx.note;

  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });

  if (summary?.content) {
    systemPrompt += `\n\n## Chat History Summary\n${summary.content}\n`;
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
    systemPrompt += `\n\n🆕 You have ${newCount} NEW message(s) from players that you have NOT answered yet — process them in this response. Messages marked with 🆕 below are new.`;
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

  return { messages, system: systemPrompt, activeGame, masterId: activeGame?.currentMasterId ?? "" };
}

async function buildPersonalContext(sessionId: string, playerId: string) {
  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const sess = await getSession();

  let systemPrompt = GM_PERSONAL_SYSTEM;

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
  systemPrompt += `\n- Player ID: ${playerId}\n`;

  systemPrompt += `\n\nPriority: read get_brain FIRST — your operating instructions tell you how to run this game and how to use the glossary for THIS system. Then use search_rules for specific rules, get_gm_notes for your hidden notes, and get_player_sheet to read this player's character data. Use get_rolls to check this player's roll results. Use update_chat_summary to save summaries.`;

  const rollsCtx = await buildRollsContext(prisma, sessionId);
  if (rollsCtx.note) systemPrompt += rollsCtx.note;

  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });

  if (summary?.content) {
    systemPrompt += `\n\n## Chat History Summary\n${summary.content}\n`;
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
    systemPrompt += `\n\n🆕 You have ${newCount} NEW message(s) from the player that you have NOT answered yet — process them in this response. Messages marked with 🆕 below are new.`;
  }

  const messages = recent.map((m) => {
    const role = (m.role === "admin" || m.role === "player" ? "user" : "assistant") as "user" | "assistant";
    const isNew = role === "user" && (!lastMasterAt || m.createdAt > lastMasterAt);
    const prefix = role === "user" ? `${isNew ? "🆕 " : ""}[${m.senderId}]: ` : "";
    return { role, content: `${prefix}${m.content}` };
  });

  // Completed rolls are the player's latest action — append as the last user turns.
  messages.push(...rollsCtx.completed);

  return { messages, system: systemPrompt, activeGame, masterId: activeGame?.currentMasterId ?? "" };
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

  const cutoffTime = new Date();

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
    const tools = getGameTools(sessionId);

    emitStarted(sessionId);
    gmLog(`START session=${sessionId} msgs=${existingMessages.length}`);
    console.log(`[gm-game] generateText start — session=${sessionId} msgs=${existingMessages.length}`);

    const result = await generateText({
      model,
      system: ctx.system,
      messages: existingMessages,
      tools,
      stopWhen: isStepCount(40),
      abortSignal: ac.signal,
      prepareStep: makePrepareStep(sessionId, Object.keys(tools).length),
      onStepFinish: async (event) => {
        const calls = (event as Record<string, unknown>).toolCalls as Array<{ toolName?: string }> | undefined;
        if (calls?.length) {
          recordActions(sessionId, calls);
          gmLog(`STEP tools=[${calls.map((c) => c.toolName).join(",")}]`);
          for (const call of calls) {
            emitStep(sessionId, call.toolName as string);
          }
        }
      },
    });

    const prisma = getPrisma();
    const finishReason = (result as unknown as { finishReason?: string })?.finishReason ?? "?";

    // Was a reply actually delivered this run (a successful send_reply saved a message)?
    const deliveredCount = () =>
      prisma.message.count({ where: { sessionId, role: "master", createdAt: { gte: cutoffTime } } });

    let delivered = await deliveredCount();
    let gmText = delivered > 0 ? null : (result.text?.trim() ?? null);
    gmLog(`FINISH reason=${finishReason} textLen=${result.text?.length ?? 0} delivered=${delivered} actions=[${getActions(sessionId).join(",")}]`);

    // The model ended without a reply (no send_reply, no text) — re-run once
    // forcing it to deliver via send_reply.
    if (!gmText && delivered === 0) {
      gmLog("RETRY empty reply");
      const retry = await generateText({
        model,
        system: ctx.system,
        messages: [
          ...existingMessages,
          { role: "user", content: "🛑 Ты закончил, но не отправил ответ (ни send_reply, ни текста). Вызови send_reply с полным текстом твоего ответа." },
        ],
        tools,
        stopWhen: isStepCount(40),
        abortSignal: ac.signal,
        prepareStep: makePrepareStep(sessionId, Object.keys(tools).length),
        onStepFinish: async (event) => {
          const calls = (event as Record<string, unknown>).toolCalls as Array<{ toolName?: string }> | undefined;
          if (calls?.length) {
            recordActions(sessionId, calls);
            gmLog(`RETRY STEP tools=[${calls.map((c) => c.toolName).join(",")}]`);
            for (const call of calls) {
              emitStep(sessionId, call.toolName as string);
            }
          }
        },
      });
      delivered = await deliveredCount();
      if (delivered === 0) {
        const retryText = retry.text?.trim();
        if (retryText) gmText = retryText;
      }
      gmLog(`RETRY DONE delivered=${delivered} textLen=${retry.text?.length ?? 0}`);
    }

    // Last resort — still nothing delivered: save a short fallback so the
    // thinking bubble never ends silently.
    if (!gmText && delivered === 0) {
      gmText = "Не удалось сформировать ответ. Попробуй ещё раз.";
      gmLog("FALLBACK empty reply");
    }

    if (gmText) {
      await prisma.message.create({
        data: {
          sessionId,
          senderId: (await getSession())?.userId ?? "",
          role: "master",
          content: gmText,
        },
      });
      broadcastGameEvent("game_message_sent", { sessionId });
      gmLog(`SAVE len=${gmText.length} delivered=${delivered}`);
    }

    await autoSummarize(sessionId);
    gmLog("DONE");
    emitDone(sessionId);

    const newMessages = await prisma.message.findMany({
      where: { sessionId, createdAt: { gt: cutoffTime } },
      select: { role: true },
    });

    const hasNewPlayerMessages = newMessages.some(
      m => (m.role === "player" || m.role === "admin")
    );

    if (hasNewPlayerMessages) {
      gmLog("RECURSIVE new player msgs arrived");
      endProcessing(sessionId);
      runGameMasterBatch(sessionId).catch((e) => {
        console.error("[gm-game] recursive batch failed:", e);
      });
      return;
    }

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

  const cutoffTime = new Date();

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
    const tools = getPersonalTools(sessionId);

    emitStarted(sessionId);
    console.log(`[gm-personal] generateText start — session=${sessionId} playerId=${playerId} tools=${JSON.stringify(Object.keys(tools))} msgs=${existingMessages.length}`);
    const result = await generateText({
      model,
      system: ctx.system,
      messages: existingMessages,
      tools,
      stopWhen: isStepCount(30),
      abortSignal: ac.signal,
      prepareStep: makePrepareStep(sessionId, Object.keys(tools).length),
      onStepFinish: async (event) => {
        const calls = (event as Record<string, unknown>).toolCalls as Array<{ toolName?: string }> | undefined;
        if (calls?.length) {
          recordActions(sessionId, calls);
          for (const call of calls) {
            emitStep(sessionId, call.toolName as string);
          }
        }
      },
    });

    const personalSteps = (result as unknown as { steps?: unknown[] }).steps;
    console.log(`[gm-personal] generateText done — steps=${personalSteps?.length ?? "?"} textLen=${result.text?.length ?? 0}`);

    const prisma = getPrisma();

    // Was a reply actually delivered this run (a successful send_reply saved a message)?
    const deliveredCount = () =>
      prisma.message.count({ where: { sessionId, role: "master", createdAt: { gte: cutoffTime } } });

    let gmText = (await deliveredCount()) > 0 ? null : (result.text?.trim() ?? null);

    // The model ended without a reply — re-run once forcing it to deliver.
    if (!gmText && (await deliveredCount()) === 0) {
      const retry = await generateText({
        model,
        system: ctx.system,
        messages: [
          ...existingMessages,
          { role: "user", content: "🛑 Ты закончил, но не отправил ответ (ни send_reply, ни текста). Вызови send_reply с полным текстом твоего ответа." },
        ],
        tools,
        stopWhen: isStepCount(30),
        abortSignal: ac.signal,
        prepareStep: makePrepareStep(sessionId, Object.keys(tools).length),
        onStepFinish: async (event) => {
          const calls = (event as Record<string, unknown>).toolCalls as Array<{ toolName?: string }> | undefined;
          if (calls?.length) {
            recordActions(sessionId, calls);
            for (const call of calls) {
              emitStep(sessionId, call.toolName as string);
            }
          }
        },
      });
      if ((await deliveredCount()) === 0) {
        const retryText = retry.text?.trim();
        if (retryText) gmText = retryText;
      }
    }

    // Last resort — still nothing delivered: short fallback so the bubble never ends silently.
    if (!gmText && (await deliveredCount()) === 0) {
      gmText = "Не удалось сформировать ответ. Попробуй ещё раз.";
    }

    if (gmText) {
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
