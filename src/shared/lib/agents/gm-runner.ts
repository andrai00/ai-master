import { generateText, isStepCount, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";
import { gmReadDocumentTool } from "./gm-tools/gm-read-document.tool";
import { gmSearchDocumentsTool } from "./gm-tools/gm-search-documents.tool";
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
import { gmRemoveRollTool, gmConfirmRollsTool } from "./gm-tools/gm-manage-rolls.tool";
import { getChatSummaryTool, updateChatSummaryTool } from "./gm-tools/gm-chat-summary.tool";
import {
  GM_GAME_SYSTEM,
  GM_PERSONAL_SYSTEM,
} from "./gm-system";
import {
  initSession, emitStarted, emitStep, emitDone, emitError,
  emitStopped, clearSession,
} from "./step-tracker";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { debugLog } from "@/src/shared/lib/debug-log";

export { emitStopped } from "./step-tracker";

const globalGuard = globalThis as unknown as {
  gmProcessing: Map<string, AbortController>;
};

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

function makePrepareStep(sessionId: string, toolsCount: number, _ctx: { activeGame?: { mode?: string; currentMasterId?: string } | null }) {
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
        { role: "assistant" as const, content: `[Compressed — ${toolsCount} tools available. Use get_rolls/search_documents for context.]` },
        ...(lastMsg && lastMsg !== lastUser ? [lastMsg] : []),
      ].filter(Boolean) as ModelMessage[],
    };
  };
}

function getGameTools() {
  return {
    read_document: gmReadDocumentTool,
    search_documents: gmSearchDocumentsTool,
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
  };
}

function getPersonalTools() {
  return {
    read_document: gmReadDocumentTool,
    search_documents: gmSearchDocumentsTool,
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
  };
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

  systemPrompt += `\n\nUse search_documents to find rules (glossary), instructions (brain), hidden notes (game_hidden), and player sheets (game_visible). Use get_rolls to check roll results. Use update_chat_summary to save summaries of key events.`;

  const unseenRolls = await prisma.roll.findMany({
    where: { sessionId, status: "completed", consumed: false },
    select: { id: true },
  });
  const unseenAssigned = await prisma.roll.findMany({
    where: { sessionId, status: "assigned" },
    select: { id: true },
  });
  if (unseenRolls.length > 0 || unseenAssigned.length > 0) {
    systemPrompt += `\n\n⚠️ ROLLS PENDING: ${unseenAssigned.length} unrolled, ${unseenRolls.length} completed with unseen results. Use get_rolls to check them.`;
  }

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
    select: { role: true, content: true, senderId: true },
  });

  const messages = recent.map((m) => ({
    role: (m.role === "admin" || m.role === "player" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

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

  systemPrompt += `\n\nUse search_documents to find rules (glossary), instructions (brain), hidden notes (game_hidden), and player sheets (game_visible). Use get_rolls to check this player's roll results. Use update_chat_summary to save summaries.`;

  const unseenRolls = await prisma.roll.findMany({
    where: { sessionId, status: "completed", consumed: false },
    select: { id: true },
  });
  const unseenAssigned = await prisma.roll.findMany({
    where: { sessionId, status: "assigned" },
    select: { id: true },
  });
  if (unseenRolls.length > 0 || unseenAssigned.length > 0) {
    systemPrompt += `\n\n⚠️ ROLLS PENDING: ${unseenAssigned.length} unrolled, ${unseenRolls.length} completed with unseen results. Use get_rolls to check them.`;
  }

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
    select: { role: true, content: true },
  });

  const messages = recent.map((m) => ({
    role: (m.role === "admin" || m.role === "player" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  return { messages, system: systemPrompt, activeGame, masterId: activeGame?.currentMasterId ?? "" };
}

async function autoSummarize(sessionId: string, _masterId: string): Promise<void> {
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

async function markRollsConsumed(sessionId: string): Promise<void> {
  const prisma = getPrisma();
  const result = await prisma.roll.updateMany({
    where: { sessionId, status: "completed", consumed: false },
    data: { consumed: true },
  });
  debugLog("gm-runner", "markRollsConsumed", { sessionId: sessionId.slice(0, 8), count: result.count });
  if (result.count > 0) {
    broadcastGameEvent("roll_completed", { sessionId });
  }
}

export async function runGameMasterBatch(sessionId: string): Promise<void> {
  debugLog("gm-runner:game", "batch start", { sessionId: sessionId.slice(0, 8) });
  const ac = startProcessing(sessionId);
  if (!ac) {
    debugLog("gm-runner:game", "batch SKIPPED (already processing)", { sessionId: sessionId.slice(0, 8) });
    return;
  }

  initSession(sessionId);

  const cutoffTime = new Date();

  try {
    const ctx = await buildGameContext(sessionId);
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
    const tools = getGameTools();

    emitStarted(sessionId);
    console.log(`[gm-game] generateText start — session=${sessionId} msgs=${existingMessages.length}`);

    const result = await generateText({
      model,
      system: ctx.system,
      messages: existingMessages,
      tools,
      stopWhen: isStepCount(40),
      abortSignal: ac.signal,
      prepareStep: makePrepareStep(sessionId, Object.keys(tools).length, ctx),
      onStepFinish: async (event) => {
        const calls = (event as Record<string, unknown>).toolCalls as Array<{ toolName?: string }> | undefined;
        if (calls?.length) {
          for (const call of calls) {
            debugLog("gm-runner:game", "onStepFinish toolCall", { tool: call.toolName });
            emitStep(sessionId, call.toolName as string);
          }
        } else {
          debugLog("gm-runner:game", "onStepFinish (no toolCalls)", { finishReason: (event as Record<string, unknown>).finishReason, text: String((event as Record<string, unknown>).text ?? "").slice(0, 80) });
        }
      },
    });

    const gmText = result.text?.trim();
    const prisma = getPrisma();

    debugLog("gm-runner:game", "generateText finished", { sessionId: sessionId.slice(0, 8), hasText: !!gmText, textLen: gmText?.length ?? 0 });

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
    }

    await markRollsConsumed(sessionId);
    await autoSummarize(sessionId, ctx.masterId);
    emitDone(sessionId);

    const newMessages = await prisma.message.findMany({
      where: { sessionId, createdAt: { gt: cutoffTime } },
      select: { role: true },
    });

    const hasNewPlayerMessages = newMessages.some(
      m => (m.role === "player" || m.role === "admin")
    );

    if (hasNewPlayerMessages) {
      debugLog("gm-runner:game", "recursive re-run (new player messages)", { sessionId: sessionId.slice(0, 8) });
      endProcessing(sessionId);
      setTimeout(() => clearSession(sessionId), 1_000);
      runGameMasterBatch(sessionId).catch((e) => {
        console.error("[gm-game] recursive batch failed:", e);
      });
      return;
    }

  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "AbortError" || err.message === "errors.cancelled")) {
      emitStopped(sessionId);
      return;
    }
    const message = err instanceof Error ? err.message : "errors.unknownError";
    console.error("[gm-game] ERROR:", message);
    emitError(sessionId, message.startsWith("errors.") ? message : "errors.unknownError");
  } finally {
    endProcessing(sessionId);
    debugLog("gm-runner:game", "batch end (clearSession scheduled 10s)", { sessionId: sessionId.slice(0, 8) });
    setTimeout(() => clearSession(sessionId), 10_000);
  }
}

export async function runGameMasterPersonal(sessionId: string, playerId: string): Promise<void> {
  debugLog("gm-runner:personal", "batch start", { sessionId: sessionId.slice(0, 8), playerId });
  const ac = startProcessing(sessionId);
  if (!ac) {
    debugLog("gm-runner:personal", "batch SKIPPED (already processing)", { sessionId: sessionId.slice(0, 8) });
    return;
  }

  initSession(sessionId);

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
    const tools = getPersonalTools();

    emitStarted(sessionId);
    console.log(`[gm-personal] generateText start — session=${sessionId} playerId=${playerId} tools=${JSON.stringify(Object.keys(tools))} msgs=${existingMessages.length}`);
    const result = await generateText({
      model,
      system: ctx.system,
      messages: existingMessages,
      tools,
      stopWhen: isStepCount(30),
      abortSignal: ac.signal,
      prepareStep: makePrepareStep(sessionId, Object.keys(tools).length, ctx),
      onStepFinish: async (event) => {
        const calls = (event as Record<string, unknown>).toolCalls as Array<{ toolName?: string }> | undefined;
        if (calls?.length) {
          for (const call of calls) {
            debugLog("gm-runner:personal", "onStepFinish toolCall", { tool: call.toolName });
            emitStep(sessionId, call.toolName as string);
          }
        } else {
          debugLog("gm-runner:personal", "onStepFinish (no toolCalls)", { finishReason: (event as Record<string, unknown>).finishReason, text: String((event as Record<string, unknown>).text ?? "").slice(0, 80) });
        }
      },
    });

    const personalSteps = (result as unknown as { steps?: unknown[] }).steps;
    console.log(`[gm-personal] generateText done — steps=${personalSteps?.length ?? "?"} textLen=${result.text?.length ?? 0}`);

    const gmText = result.text?.trim();
    const prisma = getPrisma();

    debugLog("gm-runner:personal", "generateText finished", { sessionId: sessionId.slice(0, 8), hasText: !!gmText, textLen: gmText?.length ?? 0 });

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

    await markRollsConsumed(sessionId);
    await autoSummarize(sessionId, ctx.masterId);
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
    debugLog("gm-runner:personal", "batch end (clearSession scheduled 10s)", { sessionId: sessionId.slice(0, 8) });
    setTimeout(() => clearSession(sessionId), 10_000);
  }
}
