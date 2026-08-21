import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { resolveDocumentRef } from "@/src/shared/lib/documents/resolve-ref";

export async function resolveDocId(idOrPath: string): Promise<string | null> {
  const activeGame = await getActiveGame();
  if (!activeGame) return idOrPath;

  const prisma = getPrisma();
  const ref = await resolveDocumentRef(prisma, activeGame.currentMasterId, idOrPath);
  return ref?.id ?? null;
}
