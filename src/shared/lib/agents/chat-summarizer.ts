import { generateText, isStepCount } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getPrisma } from "@/src/shared/lib/db/prisma";

const SUMMARIZE_THRESHOLD = 20;
const SUMMARIZE_BATCH = 20;

/**
 * Background auto-summarization (Claude Code /compact equivalent): when a
 * session accumulates 20+ non-summarized chat messages, one cheap LLM call
 * merges the old ChatSummary with the oldest batch and writes the new summary.
 * Fire-and-forget — must never block or break the agent run.
 */
export async function maybeSummarizeChat(masterId: string, sessionId: string): Promise<void> {
  if (!masterId) return;

  const prisma = getPrisma();
  const all = await prisma.message.findMany({
    where: { sessionId, summarized: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true },
  });
  const withText = all.filter((m) => m.content.trim().length > 0);
  if (withText.length < SUMMARIZE_THRESHOLD) return;

  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.apiKey) return;
  const model = config.model?.trim() || "gpt-4o";
  const baseURL = config.baseUrl?.trim() || undefined;
  const openai = createOpenAI({ apiKey: config.apiKey, baseURL });

  const existing = await prisma.chatSummary.findFirst({
    where: { masterId },
    select: { id: true, content: true },
  });

  const batch = withText
    .slice(0, SUMMARIZE_BATCH)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n\n");

  const prompt = `Summarize the conversation below in Markdown. Keep key events, decisions, player actions, and outcomes. Merge with the old summary — do not duplicate it.\n\n## Old summary\n${existing?.content ?? "(none)"}\n\n## New messages\n${batch}\n\nWrite the updated summary:`;

  const result = await generateText({
    model: openai.chat(model),
    system: "You are a conversation summarizer. Produce a concise but complete summary in the language of the conversation.",
    messages: [{ role: "user", content: prompt }],
    stopWhen: isStepCount(1),
  });

  const content = result.text?.trim();
  if (!content) return;

  const preview = content.slice(0, 120);
  if (existing) {
    await prisma.chatSummary.update({
      where: { id: existing.id },
      data: { content, preview },
    });
  } else {
    await prisma.chatSummary.create({
      data: { masterId, content, preview },
    });
  }

  // Mark the summarized wave of chat messages...
  const ids = withText.slice(0, SUMMARIZE_BATCH).map((m) => m.id);
  await prisma.message.updateMany({ where: { id: { in: ids } }, data: { summarized: true } });

  // ...and their runs' transcript rows (the internals are now in the summary).
  const runRefs = await prisma.message.findMany({
    where: { id: { in: ids } },
    select: { runId: true },
  });
  const runIds = [...new Set(runRefs.map((m) => m.runId).filter((v): v is string => !!v))];
  if (runIds.length > 0) {
    await prisma.agentTranscript.updateMany({
      where: { runId: { in: runIds } },
      data: { summarized: true },
    });
  }
}

/** Fire-and-forget wrapper — summarization must never break the agent run. */
export function scheduleSummarize(masterId: string, sessionId: string): void {
  void maybeSummarizeChat(masterId, sessionId).catch((err) => {
    console.error("[summarize] failed:", err instanceof Error ? err.message : String(err));
  });
}
