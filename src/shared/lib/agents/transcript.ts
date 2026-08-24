import { randomUUID } from "crypto";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import type { ModelMessage, ToolCallPart, ToolResultPart } from "ai";

// ---------------------------------------------------------------------------
// Persistent agent transcript (Claude Code-style): every run's tool calls and
// results are stored in AgentTranscript and reconstructed into the model
// context on each turn, so the agent can continue after a restart.
// ---------------------------------------------------------------------------

export function createRunId(): string {
  return randomUUID();
}

interface IPersistStepCall {
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  args?: unknown;
}

interface IPersistStepResult {
  toolCallId?: string;
  toolName?: string;
  output?: unknown;
}

export interface IPersistRunInput {
  sessionId: string;
  runId: string;
  steps?: Array<{ toolCalls?: IPersistStepCall[]; toolResults?: IPersistStepResult[] }>;
  userMessageIds?: string[];
  finalMessageId?: string;
  finalText?: string;
  status?: "done" | "aborted";
}

function safeJson(value: unknown): string {
  if (value === undefined) return "null";
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return String(value);
  }
}

function parseJson(value: string | null): unknown {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// Read tools whose results mean "the agent studied these documents".
export const STUDY_TOOLS = new Set([
  "read_document",
  "read_lines",
  "get_brain",
  "get_gm_notes",
  "get_scene_state",
  "get_player_sheet",
]);

// Write tools whose result id means "the agent now knows this document's
// current content" (it wrote it), so the cache entry must be refreshed.
export const WRITE_TOOLS = new Set([
  "create_document",
  "update_document",
  "update_char_sheet",
  "write_note",
  "set_scene_state",
  "rename_document",
]);

function collectDocIds(value: unknown, acc: Set<string>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectDocIds(item, acc);
    return;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.id === "string") acc.add(obj.id);
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v && typeof v === "object") collectDocIds(v, acc);
  }
}

/**
 * Writes one run to the transcript and tags the run's chat messages with
 * runId. Atomic: either the whole run is persisted or nothing.
 */
export async function persistRun(input: IPersistRunInput): Promise<void> {
  const prisma = getPrisma();
  const {
    sessionId,
    runId,
    steps = [],
    userMessageIds = [],
    finalMessageId,
    finalText,
    status = "done",
  } = input;

  const last = await prisma.agentTranscript.findFirst({
    where: { sessionId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  let seq = (last?.seq ?? -1) + 1;

  const rows: Array<{
    sessionId: string;
    runId: string;
    seq: number;
    kind: string;
    toolName: string | null;
    toolCallId: string | null;
    args: string | null;
    result: string | null;
    content: string | null;
    messageId: string | null;
    status: string;
  }> = [];

  // Some providers/setups can end a step with a tool call but no tool result
  // (e.g. a tool error that terminated the stream). Persisting such an orphan
  // tool-call breaks the next run (AI_MissingToolResultsError), so skip calls
  // whose toolCallId has no matching result anywhere in the run.
  const resultCallIds = new Set<string>();
  for (const step of steps ?? []) {
    for (const res of step.toolResults ?? []) {
      if (res.toolCallId) resultCallIds.add(res.toolCallId);
    }
  }

  for (const step of steps ?? []) {
    for (const call of step.toolCalls ?? []) {
      if (call.toolCallId && !resultCallIds.has(call.toolCallId)) continue;
      rows.push({
        sessionId, runId, seq: seq++, kind: "tool-call",
        toolName: call.toolName ?? null,
        toolCallId: call.toolCallId ?? null,
        args: safeJson(call.input ?? call.args),
        result: null,
        content: null,
        messageId: null,
        status,
      });
    }
    for (const res of step.toolResults ?? []) {
      rows.push({
        sessionId, runId, seq: seq++, kind: "tool-result",
        toolName: res.toolName ?? null,
        toolCallId: res.toolCallId ?? null,
        args: null,
        result: safeJson(res.output),
        content: null,
        messageId: null,
        status,
      });
    }
  }

  if (finalText) {
    rows.push({
      sessionId, runId, seq: seq++, kind: "text",
      toolName: null, toolCallId: null, args: null, result: null,
      content: finalText,
      messageId: finalMessageId ?? null,
      status,
    });
  }

  if (rows.length > 0) {
    await prisma.agentTranscript.createMany({ data: rows });
  }

  // Refresh the study journal (DocumentRead): reads AND writes mark the doc as
  // "known in its current state" (readAt = now). Delete removes the entry.
  // Summarization later evicts rows whose runId got summarized (the content
  // is no longer in the context, so the doc is not "studied" anymore).
  const touchIds = new Set<string>();
  const deleteIds = new Set<string>();
  for (const step of steps ?? []) {
    for (const res of step.toolResults ?? []) {
      if (res.toolName && (STUDY_TOOLS.has(res.toolName) || WRITE_TOOLS.has(res.toolName))) {
        collectDocIds(res.output, touchIds);
      }
    }
    // delete_document has no id in its result — grab it from the call args.
    for (const call of step.toolCalls ?? []) {
      if (call.toolName === "delete_document") {
        const id = (call.input as { id?: unknown } | undefined)?.id;
        if (typeof id === "string") deleteIds.add(id);
      }
    }
  }
  if (touchIds.size > 0) {
    const docIds = [...touchIds];
    const existing = await prisma.documentRead.findMany({
      where: { sessionId, documentId: { in: docIds } },
      select: { documentId: true },
    });
    const have = new Set(existing.map((d) => d.documentId));
    const missing = docIds.filter((id) => !have.has(id));
    if (missing.length > 0) {
      await prisma.documentRead.createMany({
        data: missing.map((documentId) => ({ sessionId, documentId, runId })),
      });
    }
    if (have.size > 0) {
      await prisma.documentRead.updateMany({
        where: { sessionId, documentId: { in: [...have] } },
        data: { readAt: new Date(), runId },
      });
    }
  }
  if (deleteIds.size > 0) {
    await prisma.documentRead.deleteMany({ where: { sessionId, documentId: { in: [...deleteIds] } } });
  }

  // Tag chat messages of a successful run so buildTranscript can interleave
  // user/final text with the tool rows. Aborted runs are not tagged — the
  // next turn starts fresh from the user message.
  const idsToTag: string[] = [];
  if (status === "done") {
    idsToTag.push(...userMessageIds);
    if (finalMessageId) idsToTag.push(finalMessageId);
  }
  if (idsToTag.length > 0) {
    await prisma.message.updateMany({
      where: { id: { in: idsToTag } },
      data: { runId },
    });
  }
}

export interface IBuildTranscriptOptions {
  /** Marks the newest (unanswered) user messages with 🆕. */
  markNew?: (messageId: string) => boolean;
  /** Optional prefix for user messages (e.g. the sender's name in a game chat). */
  userLabel?: (info: { senderId: string; senderDisplayName: string | null }) => string;
}

/**
 * Reconstructs the model context for a session: chat messages (Message) merged
 * with the run transcript (AgentTranscript) by runId, in chronological order.
 * Tool calls/results are emitted in parts format so the model sees exactly
 * what it studied, exactly like a Cursor/Claude Code transcript.
 */
export async function buildTranscript(
  sessionId: string,
  opts?: IBuildTranscriptOptions
): Promise<ModelMessage[]> {
  const prisma = getPrisma();
  const [messages, rows] = await Promise.all([
    prisma.message.findMany({
      where: { sessionId, summarized: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, runId: true, senderId: true, sender: { select: { displayName: true } } },
    }),
    prisma.agentTranscript.findMany({
      where: { sessionId, summarized: false, status: "done" },
      orderBy: { seq: "asc" },
      select: {
        id: true, runId: true, seq: true, kind: true,
        toolName: true, toolCallId: true, args: true, result: true, content: true,
      },
    }),
  ]);

  const rowsByRun = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.runId) continue;
    const list = rowsByRun.get(r.runId) ?? [];
    list.push(r);
    rowsByRun.set(r.runId, list);
  }

  const msgsByRun = new Map<string, typeof messages>();
  for (const m of messages) {
    if (!m.runId) continue;
    const list = msgsByRun.get(m.runId) ?? [];
    list.push(m);
    msgsByRun.set(m.runId, list);
  }

  const emittedRuns = new Set<string>();
  const skipIds = new Set<string>();
  const out: ModelMessage[] = [];

  const modelRole = (role: string): "user" | "assistant" =>
    role === "admin" || role === "player" ? "user" : "assistant";

  const emitText = (m: (typeof messages)[number], role?: "user" | "assistant") => {
    const r = role ?? modelRole(m.role);
    let content = m.content;
    if (r === "user") {
      if (opts?.markNew?.(m.id)) content = `🆕 ${content}`;
      if (opts?.userLabel) {
        content = opts.userLabel({ senderId: m.senderId, senderDisplayName: m.sender?.displayName ?? null }) + content;
      }
    }
    out.push({ role: r, content });
  };

  const emitToolRows = (runRows: typeof rows) => {
    // Skip orphan tool-calls (a call whose toolCallId has no matching result):
    // emitting them makes the next streamText throw AI_MissingToolResultsError.
    const resultCallIds = new Set<string>();
    for (const r of runRows) {
      if (r.kind === "tool-result" && r.toolCallId) resultCallIds.add(r.toolCallId);
    }
    let i = 0;
    while (i < runRows.length) {
      const row = runRows[i];
      if (row.kind === "tool-call") {
        const content: ToolCallPart[] = [];
        while (i < runRows.length && runRows[i].kind === "tool-call") {
          const callId = runRows[i].toolCallId;
          if (callId && !resultCallIds.has(callId)) {
            i++;
            continue;
          }
          content.push({
            type: "tool-call",
            toolCallId: callId ?? "",
            toolName: runRows[i].toolName ?? "",
            input: parseJson(runRows[i].args),
          });
          i++;
        }
        if (content.length > 0) out.push({ role: "assistant", content });
      } else if (row.kind === "tool-result") {
        const content: ToolResultPart[] = [{
          type: "tool-result",
          toolCallId: row.toolCallId ?? "",
          toolName: row.toolName ?? "",
          output: { type: "json", value: parseJson(row.result) } as ToolResultPart["output"],
        }];
        out.push({ role: "tool", content });
        i++;
      } else {
        // kind === "text" — final text copy; the final reply comes from Message
        i++;
      }
    }
  };

  for (const m of messages) {
    if (skipIds.has(m.id)) continue;

    if (m.runId && !emittedRuns.has(m.runId)) {
      const runRows = rowsByRun.get(m.runId);
      if (runRows && runRows.length > 0) {
        emittedRuns.add(m.runId);
        const runMsgs = msgsByRun.get(m.runId) ?? [];
        for (const um of runMsgs) {
          if (modelRole(um.role) === "user") {
            emitText(um);
            skipIds.add(um.id);
          }
        }
        emitToolRows(runRows);
        for (const fm of runMsgs) {
          if (modelRole(fm.role) === "assistant") {
            emitText(fm, "assistant");
            skipIds.add(fm.id);
          }
        }
        continue;
      }
    }

    emitText(m);
  }

  return out;
}

/** Live cache refresh for a single tool execution (called by the runner's
 * tool wrapper DURING the generation, so review_turn sees fresh state, and
 * again by persistRun at the end). Reads and writes mark the doc as known
 * (readAt = now); delete_document removes the entry. */
export async function refreshDocumentCache(
  sessionId: string,
  toolName: string,
  output: unknown,
  callInput?: unknown
): Promise<void> {
  const prisma = getPrisma();
  const touch = new Set<string>();

  if (toolName === "delete_document") {
    // Only evict the cache entry when the doc was actually deleted (the tool
    // returns { success:false } for forbidden categories like brain/glossary).
    const ok = (output as { deleted?: boolean; success?: boolean } | undefined)?.deleted === true;
    if (!ok) return;
    const id = (callInput as { id?: unknown } | undefined)?.id;
    if (typeof id === "string") {
      await prisma.documentRead.deleteMany({ where: { sessionId, documentId: id } });
    }
    return;
  }

  if (STUDY_TOOLS.has(toolName) || WRITE_TOOLS.has(toolName)) {
    collectDocIds(output, touch);
  }
  if (touch.size === 0) return;

  const docIds = [...touch];
  const existing = await prisma.documentRead.findMany({
    where: { sessionId, documentId: { in: docIds } },
    select: { documentId: true },
  });
  const have = new Set(existing.map((d) => d.documentId));
  const missing = docIds.filter((id) => !have.has(id));
  if (missing.length > 0) {
    await prisma.documentRead.createMany({
      data: missing.map((documentId) => ({ sessionId, documentId })),
    });
  }
  if (have.size > 0) {
    await prisma.documentRead.updateMany({
      where: { sessionId, documentId: { in: [...have] } },
      data: { readAt: new Date() },
    });
  }
}

/**
 * Wraps every tool's execute so the study journal (DocumentRead) stays live
 * DURING the generation: reads/writes refresh the cache entry immediately.
 * Used by the GM runner alongside wrapToolSet. Never throws — the cache must
 * never break a tool result.
 */
export function wrapLiveCache<T extends Record<string, unknown>>(tools: T, sessionId: string): T {
  const out: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const t = tool as { execute?: (args: unknown) => Promise<unknown> } | undefined;
    if (!t?.execute) {
      out[name] = tool;
      continue;
    }
    out[name] = {
      ...t,
      execute: async (args: unknown) => {
        const result = await t.execute!(args);
        try {
          await refreshDocumentCache(sessionId, name, result, args);
        } catch (e) {
          console.error(`[cache] refresh failed for ${name}:`, e instanceof Error ? e.message : String(e));
        }
        return result;
      },
    };
  }
  return out as T;
}

/**
 * Compact block of previously studied documents (DocumentRead journal) injected
 * into the context — "you already read X, changed after reading: yes/no".
 * Documents are always filtered by the current game (masterId).
 */
export async function buildStudyJournalContext(
  sessionId: string,
  masterId: string
): Promise<string> {
  const prisma = getPrisma();
  const reads = await prisma.documentRead.findMany({
    where: { sessionId },
    orderBy: { readAt: "desc" },
    take: 50,
  });
  if (reads.length === 0) return "";

  const docs = await prisma.document.findMany({
    where: { id: { in: reads.map((r) => r.documentId) }, masterId },
    select: { id: true, title: true, updatedAt: true },
  });
  const docById = new Map(docs.map((d) => [d.id, d]));
  const readById = new Map(reads.map((r) => [r.documentId, r]));

  const lines: string[] = [];
  for (const r of reads) {
    const doc = docById.get(r.documentId);
    if (!doc) continue;
    const changed = readById.get(r.documentId)!.readAt < doc.updatedAt;
    lines.push(`- ${doc.title} (${doc.id})${changed ? " — ИЗМЕНИЛСЯ после чтения" : ""}`);
  }
  if (lines.length === 0) return "";
  return `\n\n## Ранее прочитанные документы этой сессии\n${lines.join("\n")}\n`;
}

/**
 * Cascade for message deletion: deleting any message of a run removes the
 * run's transcript rows so the context never references deleted messages.
 */
export async function cascadeDeleteMessageRun(messageId: string): Promise<void> {
  const prisma = getPrisma();
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { runId: true },
  });
  if (msg?.runId) {
    await prisma.agentTranscript.deleteMany({ where: { runId: msg.runId } });
  }
}

/** Cascade for chat clear: removes transcript and study journal of the session. */
export async function cascadeClearSession(sessionId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.agentTranscript.deleteMany({ where: { sessionId } });
  await prisma.documentRead.deleteMany({ where: { sessionId } });
}
