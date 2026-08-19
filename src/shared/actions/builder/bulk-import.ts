"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { assertNotGameMode } from "@/src/shared/lib/db/game-mode-guard";

function stripMd(name: string): string {
  return name.replace(/\.md$/i, "");
}

/** Normalizes a folder path: trims slashes, keeps leading slash for matching. */
function normalizeFolder(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** Returns the LONGEST matching typeMap prefix for a file path, or null. */
function matchType(filePath: string, prefixes: Array<{ prefix: string; type: string }>): string | null {
  const normalized = filePath.trim().replace(/^\/+|\/+$/g, "");
  let best: { prefix: string; type: string } | null = null;
  for (const p of prefixes) {
    const pn = p.prefix.trim().replace(/^\/+|\/+$/g, "");
    if (pn === "" ) continue;
    if (normalized === pn || normalized.startsWith(pn + "/")) {
      if (!best || pn.length > best.prefix.trim().replace(/^\/+|\/+$/g, "").length) {
        best = p;
      }
    }
  }
  return best?.type ?? null;
}

export async function bulkImportToGlossaryAction(
  typeMap: Record<string, string>
): Promise<{ success: boolean; imported: number; byType: Record<string, number>; error?: string; skipped?: string[] }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, imported: 0, byType: {}, error: "errors.forbidden" };

  await assertNotGameMode().catch(() => {
    return { success: false, imported: 0, byType: {}, error: "errors.gameModeReadOnly" };
  });

  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;
  if (!masterId) return { success: false, imported: 0, byType: {}, error: "errors.noActiveGame" };

  const prisma = getPrisma();

  // Build prefix list (longest-first semantics handled by matchType).
  const prefixes = Object.entries(typeMap).map(([prefix, type]) => ({
    prefix: normalizeFolder(prefix),
    type,
  }));

  // --- Phase 1: collect metadata of ALL ready files (no text yet), assign
  // the best matching type, then fetch content ONLY for files that will be
  // imported. Avoids loading every file's body when only some folders match.
  const allMeta = await prisma.uploadedFile.findMany({
    where: { masterId, status: "ready" },
    select: { id: true, filename: true, path: true },
    orderBy: [{ path: "asc" }, { filename: "asc" }],
  });

  const matched: Array<{ id: string; filename: string; path: string; type: string }> = [];
  const skipped: string[] = [];
  for (const f of allMeta) {
    const type = matchType(f.path, prefixes);
    if (type === null) {
      skipped.push(f.path ? `${f.path}/${f.filename}` : f.filename);
      continue;
    }
    matched.push({ id: f.id, filename: f.filename, path: f.path, type });
  }

  if (matched.length === 0) {
    return { success: true, imported: 0, byType: {}, skipped };
  }

  const contents = await prisma.uploadedFile.findMany({
    where: { id: { in: matched.map((m) => m.id) } },
    select: { id: true, text: true },
  });
  const textById = new Map(contents.map((c) => [c.id, c.text]));
  const toImport = matched.map((m) => ({ ...m, text: textById.get(m.id) ?? "" }));

  // --- Phase 2: batch upsert — one read of existing titles, then createMany
  // for new docs and chunked updates for existing ones. NEVER loop with a
  // findFirst+create per file: thousands of sequential SQLite queries hold
  // the DB write lock for minutes and freeze the whole Next.js app.
  const titles = toImport.map((f) => {
    const base = stripMd(f.filename);
    return f.path ? `${f.path}/${base}`.replace(/^\//, "") : base;
  });

  const existing = await prisma.document.findMany({
    where: { masterId, category: "glossary", title: { in: titles } },
    select: { id: true, title: true },
  });
  const existingByTitle = new Map(existing.map((d) => [d.title, d.id]));

  const byType: Record<string, number> = {};
  let totalImported = 0;

  const newRows: Array<{
    masterId: string;
    title: string;
    content: string;
    category: "glossary";
    type: string;
    tags: string;
    summary: string | null;
  }> = [];
  const updates: Array<{ id: string; content: string; type: string; tags: string }> = [];

  for (let i = 0; i < toImport.length; i++) {
    const f = toImport[i];
    const title = titles[i];
    const data = {
      content: f.text,
      category: "glossary" as const,
      type: f.type,
      tags: JSON.stringify([f.path.split("/").filter(Boolean).pop() ?? ""]),
      summary: null as string | null,
    };

    const existingId = existingByTitle.get(title);
    if (existingId) {
      updates.push({ id: existingId, content: data.content, type: data.type, tags: data.tags });
    } else {
      newRows.push({ masterId, title, ...data });
    }

    byType[f.type] = (byType[f.type] || 0) + 1;
    totalImported++;
  }

  if (newRows.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < newRows.length; i += CHUNK) {
      await prisma.document.createMany({ data: newRows.slice(i, i + CHUNK) });
    }
  }

  if (updates.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map((u) => prisma.document.update({ where: { id: u.id }, data: { content: u.content, type: u.type, tags: u.tags } }))
      );
    }
  }

  // --- Phase 3: cleanup only the imported uploaded files (keep unmatched) ---
  await prisma.uploadedFile.deleteMany({
    where: { id: { in: toImport.map((f) => f.id) } },
  });

  if (totalImported > 0) {
    broadcastGameEvent("document_updated", { masterId });
  }

  return { success: true, imported: totalImported, byType, skipped: skipped.length > 0 ? skipped.slice(0, 20) : undefined };
}
