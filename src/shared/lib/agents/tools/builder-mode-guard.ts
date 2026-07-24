import "server-only";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export type TBuilderMode = "brain" | "memory";

/** Get the current builder mode for the active game's builder session. */
export async function getCurrentBuilderMode(): Promise<TBuilderMode> {
  const activeGame = await getActiveGame();
  if (!activeGame) return "brain";

  const prisma = getPrisma();
  const s = await prisma.session.findFirst({
    where: { masterId: activeGame.currentMasterId, type: "builder" },
    select: { builderMode: true },
  });
  return (s?.builderMode as TBuilderMode) ?? "brain";
}

/** Returns allowed read categories for current builder mode. */
export async function getReadableCategories(): Promise<string[]> {
  const mode = await getCurrentBuilderMode();
  if (mode === "brain") return ["glossary", "brain"];
  return ["glossary", "brain", "game_hidden", "game_visible"];
}

/** Returns allowed write categories for current builder mode. */
export async function getWritableCategories(): Promise<string[]> {
  const mode = await getCurrentBuilderMode();
  if (mode === "brain") return ["glossary", "brain"];
  return ["game_hidden", "game_visible"];
}

/** Throws if the given category cannot be written in the current mode. */
export async function assertCanWrite(category: string): Promise<void> {
  const writable = await getWritableCategories();
  if (!writable.includes(category)) {
    throw new Error(`errors.cannotWriteInMode: cannot write ${category} in current builder mode`);
  }
}

/** Throws if the given category cannot be read in the current mode. */
export async function assertCanRead(category: string): Promise<void> {
  const readable = await getReadableCategories();
  if (!readable.includes(category)) {
    throw new Error(`errors.cannotReadInMode: cannot read ${category} in current builder mode`);
  }
}
