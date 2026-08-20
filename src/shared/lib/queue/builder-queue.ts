import "server-only";

import Queue from "better-queue";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { runBuilderAgent, isProcessing } from "@/src/shared/lib/agents/builder-runner";

const MAX_CONCURRENT = 3;

export interface IQueueJob {
  id: string;
  sessionId: string;
  content: string;
  fileIds: string[];
}

type QueueProcessor = (job: IQueueJob, cb: (err: unknown, result?: unknown) => void) => void;

const globalQueue = globalThis as unknown as {
  instance: Queue<IQueueJob> | undefined;
  initialized: boolean;
};

async function processJob(job: IQueueJob): Promise<void> {
  const prisma = getPrisma();

  await prisma.builderJob.update({
    where: { id: job.id },
    data: { status: "processing" },
  });

  try {
    await runBuilderAgent(job.sessionId, job.content, job.fileIds);

    await prisma.builderJob.update({
      where: { id: job.id },
      data: { status: "done" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.builderJob.update({
      where: { id: job.id },
      data: { status: "failed", error: msg.slice(0, 2000) },
    });
    throw err;
  }
}

async function recoverStaleJobs(): Promise<void> {
  const prisma = getPrisma();
  const stale = await prisma.builderJob.findMany({
    where: { status: { in: ["pending", "processing"] } },
    orderBy: { createdAt: "asc" },
  });

  for (const job of stale) {
    if (job.status === "processing") {
      await prisma.builderJob.update({
        where: { id: job.id },
        data: { status: "failed", error: "Interrupted by server restart" },
      });
      console.log(`[queue] Marked stale processing job ${job.id} as failed`);
      continue;
    }

    const input = JSON.parse(job.input) as { content: string; fileIds: string[] };
    getQueue().push({
      id: job.id,
      sessionId: job.sessionId,
      content: input.content,
      fileIds: input.fileIds,
    });
  }

  if (stale.length > 0) {
    console.log(`[queue] Recovered ${stale.filter(j => j.status === "pending").length} pending jobs, marked ${stale.filter(j => j.status === "processing").length} processing as failed on startup`);
  }
}

function getQueue(): Queue<IQueueJob> {
  if (!globalQueue.instance) {
    globalQueue.instance = new Queue<IQueueJob>(
      ((job: IQueueJob, cb: (err: unknown, result?: unknown) => void) => {
        processJob(job).then(
          () => cb(null, undefined),
          (err) => cb(err),
        );
      }) as QueueProcessor,
      {
        concurrent: MAX_CONCURRENT,
        maxRetries: 0,
      },
    );
  }
  return globalQueue.instance;
}

function initQueue(): void {
  if (!globalQueue.initialized) {
    globalQueue.initialized = true;
    getQueue();
    recoverStaleJobs().catch((err) => {
      console.error("[queue] Failed to recover stale jobs:", err);
    });
  }
}

export async function enqueueBuilderJob(
  sessionId: string,
  content: string,
  fileIds: string[],
): Promise<string> {
  initQueue();

  const prisma = getPrisma();
  const dbJob = await prisma.builderJob.create({
    data: {
      sessionId,
      status: "pending",
      input: JSON.stringify({ content, fileIds }),
    },
  });

  getQueue().push({
    id: dbJob.id,
    sessionId,
    content,
    fileIds,
  });

  return dbJob.id;
}

export async function hasActiveJobs(sessionId: string): Promise<boolean> {
  if (isProcessing(sessionId)) return true;

  const prisma = getPrisma();
  const active = await prisma.builderJob.findFirst({
    where: {
      sessionId,
      status: { in: ["pending", "processing"] },
    },
    select: { id: true },
  });
  return active !== null;
}
