import { generateText, isStepCount } from "ai";
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
import {
  GM_GAME_SYSTEM,
  GM_PERSONAL_SYSTEM,
} from "./gm-system";
import {
  initSession, emitStarted, emitStep, emitDone, emitError,
  emitStopped, clearSession,
} from "./step-tracker";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

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

  const brainDocs = await prisma.document.findMany({
    where: { masterId: activeGame?.currentMasterId ?? "", category: "brain" },
    select: { title: true, summary: true, content: true },
    take: 10,
  });

  if (brainDocs.length > 0) {
    systemPrompt += "\n\n## Brain (game instructions)\n";
    for (const d of brainDocs) {
      systemPrompt += `\n### ${d.title}\n${d.summary ?? d.content.slice(0, 300)}\n`;
    }
  }

  const recentNotes = await prisma.document.findMany({
    where: { masterId: activeGame?.currentMasterId ?? "", category: "game_hidden" },
    select: { title: true, content: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  if (recentNotes.length > 0) {
    systemPrompt += "\n\n## Your recent notes (game_hidden)\n";
    for (const n of recentNotes) {
      systemPrompt += `\n### ${n.title}\n${n.content.slice(0, 500)}\n`;
    }
  }

  const playerDocs = await prisma.document.findMany({
    where: { masterId: activeGame?.currentMasterId ?? "", category: "game_visible" },
    select: { title: true, playerId: true, summary: true, content: true, type: true },
    take: 20,
  });

  if (playerDocs.length > 0) {
    systemPrompt += "\n\n## Player character sheets and game documents (game_visible)\n";
    for (const d of playerDocs) {
      const label = d.playerId ? `[Player: ${d.playerId}]` : "[Common]";
      systemPrompt += `\n### ${d.title} ${label}\n${d.summary ?? d.content.slice(0, 300)}\n`;
    }

    const charSheets = playerDocs.filter(d => d.type === "character_sheet" && d.playerId);
    if (charSheets.length > 0) {
      systemPrompt += "\n\n## Player-Character Mapping\n";
      systemPrompt += "Address players by character name, NOT by login/userId. When mentioning a character, use **bold** formatting.\n";
      for (const cs of charSheets) {
        systemPrompt += `- senderId ${cs.playerId} → **${cs.title}**\n`;
      }
    }
  }

  const recent = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    take: 30,
    select: { role: true, content: true, senderId: true },
  });

  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });

  if (summary?.content) {
    systemPrompt += `\n\n## Chat History Summary\n${summary.content}\n`;
  }

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

  const brainDocs = await prisma.document.findMany({
    where: { masterId: activeGame?.currentMasterId ?? "", category: "brain" },
    select: { title: true, summary: true, content: true },
    take: 10,
  });

  if (brainDocs.length > 0) {
    systemPrompt += "\n\n## Brain (game instructions)\n";
    for (const d of brainDocs) {
      systemPrompt += `\n### ${d.title}\n${d.summary ?? d.content.slice(0, 300)}\n`;
    }
  }

  const playerDocs = await prisma.document.findMany({
    where: {
      masterId: activeGame?.currentMasterId ?? "",
      category: "game_visible",
      playerId,
    },
    select: { title: true, summary: true, content: true },
    take: 10,
  });

  if (playerDocs.length > 0) {
    systemPrompt += "\n\n## This player's character sheets (game_visible)\n";
    for (const d of playerDocs) {
      systemPrompt += `\n### ${d.title}\n${d.summary ?? d.content.slice(0, 500)}\n`;
    }
  } else {
    systemPrompt += "\n\n## This player has no character sheets yet. You can help them create one.\n";
  }

  const recent = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { role: true, content: true },
  });

  const summary = await prisma.chatSummary.findFirst({
    where: { masterId: activeGame?.currentMasterId ?? "" },
    select: { content: true },
  });

  if (summary?.content) {
    systemPrompt += `\n\n## Chat History Summary\n${summary.content}\n`;
  }

  const messages = recent.map((m) => ({
    role: (m.role === "admin" || m.role === "player" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  console.log(`[gm-personal] buildContext — present_roll_check in prompt: ${systemPrompt.includes("present_roll_check")}, tools: ${Object.keys(getPersonalTools()).length}`);

  return { messages, system: systemPrompt, activeGame, masterId: activeGame?.currentMasterId ?? "" };
}

async function autoSummarize(sessionId: string, masterId: string): Promise<void> {
  const prisma = getPrisma();
  const allUnsummarized = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true },
  });
  const withText = allUnsummarized.filter(m => m.content.trim().length > 0);
  if (withText.length < 20) return;

  const toSummarize = withText.slice(0, 20);
  const preview = toSummarize
    .filter(m => m.role === "player" || m.role === "admin")
    .map(m => m.content.slice(0, 40))
    .join(" | ");

  const existing = await prisma.chatSummary.findFirst({ where: { masterId } });
  const prevContent = existing?.content ? existing.content.replace(/^📋.*?\n\n/, "") + "\n\n" : "";
  const newContent = `📋 Chat Summary\n\n${prevContent}🆕 ${preview}`;

  if (existing) {
    await prisma.chatSummary.update({ where: { id: existing.id }, data: { content: newContent, preview } });
  } else {
    await prisma.chatSummary.create({ data: { masterId, content: newContent, preview } });
  }

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
  if (result.count > 0) {
    broadcastGameEvent("roll_completed", { sessionId });
  }
}

export async function runGameMasterBatch(sessionId: string): Promise<void> {
  const ac = startProcessing(sessionId);
  if (!ac) return;

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
      onStepFinish: async (event) => {
        const calls = (event as Record<string, unknown>).toolCalls as Array<{ toolName?: string }> | undefined;
        if (calls?.length) {
          for (const call of calls) {
            emitStep(sessionId, call.toolName as string);
          }
        }
      },
    });

    const gmText = result.text?.trim();
    const prisma = getPrisma();

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
    setTimeout(() => clearSession(sessionId), 10_000);
  }
}

export async function runGameMasterPersonal(sessionId: string, playerId: string): Promise<void> {
  const ac = startProcessing(sessionId);
  if (!ac) return;

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
    console.log(`[gm-personal] generateText start — session=${sessionId} playerId=${playerId}`);

    const result = await generateText({
      model,
      system: ctx.system,
      messages: existingMessages,
      tools,
      stopWhen: isStepCount(30),
      abortSignal: ac.signal,
      onStepFinish: async (event) => {
        const calls = (event as Record<string, unknown>).toolCalls as Array<{ toolName?: string }> | undefined;
        if (calls?.length) {
          for (const call of calls) {
            emitStep(sessionId, call.toolName as string);
          }
        }
      },
    });

    const gmText = result.text?.trim();
    const prisma = getPrisma();

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
    setTimeout(() => clearSession(sessionId), 10_000);
  }
}
