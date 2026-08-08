"use server";

import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { getSession } from "@/src/shared/lib/auth/session";
import { assertNotGameMode } from "@/src/shared/lib/db/game-mode-guard";

function stripMd(name: string): string {
  return name.replace(/\.md$/i, "");
}

export async function bulkImportToGlossaryAction(
  typeMap: Record<string, string>
): Promise<{ success: boolean; imported: number; byType: Record<string, number>; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { success: false, imported: 0, byType: {}, error: "errors.forbidden" };

  await assertNotGameMode().catch(() => {
    return { success: false, imported: 0, byType: {}, error: "errors.gameModeReadOnly" };
  });

  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;
  if (!masterId) return { success: false, imported: 0, byType: {}, error: "errors.noActiveGame" };

  const prisma = getPrisma();

  // --- Phase 1: collect all files across all folders ---
  const allFiles: Array<{ filename: string; path: string; text: string; type: string }> = [];

  for (const [folderPath, docType] of Object.entries(typeMap)) {
    const files = await prisma.uploadedFile.findMany({
      where: { masterId, path: folderPath, status: "ready" },
      select: { filename: true, path: true, text: true },
    });

    for (const f of files) {
      allFiles.push({ filename: f.filename, path: f.path, text: f.text, type: docType });
    }
  }

  if (allFiles.length === 0) {
    return { success: true, imported: 0, byType: {} };
  }

  // --- Phase 2: build titles — always include path for cross-reference matching ---
  const byType: Record<string, number> = {};
  let totalImported = 0;

  for (const [folderPath, docType] of Object.entries(typeMap)) {
    const folderFiles = allFiles.filter((f) => f.type === docType && f.path === folderPath);
    if (folderFiles.length === 0) continue;

    const documents = folderFiles.map((f) => {
      const base = stripMd(f.filename);
      const title = f.path ? `${f.path}/${base}`.replace(/^\//, "") : base;
      return {
        masterId,
        title,
        content: f.text,
        category: "glossary" as const,
        type: docType,
        tags: JSON.stringify([f.path.split("/").filter(Boolean).pop() ?? ""]),
        summary: null as string | null,
      };
    });

    await prisma.document.createMany({ data: documents });

    byType[docType] = (byType[docType] || 0) + folderFiles.length;
    totalImported += folderFiles.length;
  }

  // --- Phase 5: cleanup all uploaded files ---
  for (const folderPath of Object.keys(typeMap)) {
    await prisma.uploadedFile.deleteMany({
      where: { masterId, path: folderPath },
    });
  }

  return { success: true, imported: totalImported, byType };
}
