import { getPrisma } from "@/src/shared/lib/db/prisma";

export interface ITurnDigest {
  staleDocs: Array<{ id: string; title: string }>;
  scene: { id: string; title: string; stale: boolean } | null;
  memoryIndex: { id: string; title: string; stale: boolean } | null;
  completedRolls: number;
  pendingRolls: number;
}

/**
 * Computes the current game state digest for the GM's turn planning/review.
 * Pure DB reads — no LLM. Used by plan_turn (before acting) and review_turn
 * (before the final reply). Every read tool refresh in persistRun keeps
 * DocumentRead = "docs the agent knows in their current state"; a doc whose
 * updatedAt moved past the last read/write is flagged as stale.
 */
export async function buildTurnDigest(
  sessionId: string,
  masterId: string
): Promise<ITurnDigest> {
  const prisma = getPrisma();

  const reads = await prisma.documentRead.findMany({
    where: { sessionId },
    select: { documentId: true, readAt: true },
  });
  const docIds = reads.map((r) => r.documentId);

  const [docs, scene, index, memoryDocs, completedRolls, pendingRolls] = await Promise.all([
    docIds.length
      ? prisma.document.findMany({
          where: { id: { in: docIds }, masterId, status: "active" },
          select: { id: true, title: true, updatedAt: true },
        })
      : Promise.resolve([]),
    prisma.document.findFirst({
      where: { masterId, category: "game_hidden", type: "scene", status: "active" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    }),
    prisma.document.findFirst({
      where: { masterId, category: "game_hidden", type: "_index", status: "active" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    }),
    prisma.document.findMany({
      where: {
        masterId,
        category: "game_hidden",
        status: "active",
        path: { startsWith: "hidden/memory/" },
      },
      select: { id: true, title: true, updatedAt: true },
    }),
    prisma.roll.count({ where: { sessionId, status: "completed", consumed: false } }),
    prisma.roll.count({ where: { sessionId, status: "assigned" } }),
  ]);

  const readAtById = new Map(reads.map((r) => [r.documentId, r.readAt]));
  const staleDocs = docs.filter((d) => (readAtById.get(d.id) ?? new Date(0)) < d.updatedAt);

  const sceneStale = scene
    ? (readAtById.get(scene.id) ?? new Date(0)) < scene.updatedAt
    : false;

  // The memory index is stale when any hidden/memory section was updated after it.
  let indexStale = false;
  if (index) {
    const latestSection = memoryDocs
      .filter((d) => d.id !== index.id)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    indexStale = !!latestSection && latestSection.updatedAt > index.updatedAt;
  }

  return {
    staleDocs: staleDocs.map((d) => ({ id: d.id, title: d.title })),
    scene: scene ? { id: scene.id, title: scene.title, stale: sceneStale } : null,
    memoryIndex: index ? { id: index.id, title: index.title, stale: indexStale } : null,
    completedRolls,
    pendingRolls,
  };
}

/** Renders the digest as a compact checklist block for the model. */
export function formatTurnDigest(d: ITurnDigest): string {
  const lines: string[] = [];
  if (d.staleDocs.length > 0) {
    lines.push(
      `- Документы изменились после последнего чтения: ${d.staleDocs.map((x) => `«${x.title}»`).join(", ")} — перечитай перед использованием.`
    );
  }
  if (d.scene) {
    lines.push(
      `- Сцена «${d.scene.title}»: активна${d.scene.stale ? " (изменилась после чтения — перечитай)" : ""}.`
    );
  }
  if (d.memoryIndex) {
    lines.push(
      `- Индекс памяти «${d.memoryIndex.title}»:${d.memoryIndex.stale ? " УСТАРЕЛ — обнови после правок памяти." : " актуален."}`
    );
  }
  if (d.completedRolls > 0) {
    lines.push(
      `- Завершённых бросков, ждущих подтверждения: ${d.completedRolls} — используй результат и вызови confirm_rolls (важные сохрани в game_hidden до этого).`
    );
  }
  if (d.pendingRolls > 0) {
    lines.push(`- Ожидают броска игроков: ${d.pendingRolls}.`);
  }
  if (lines.length === 0) {
    lines.push("- Всё актуально: ничего не изменилось с прошлого хода.");
  }
  return `\n## Состояние на входе (авто)\n${lines.join("\n")}`;
}
