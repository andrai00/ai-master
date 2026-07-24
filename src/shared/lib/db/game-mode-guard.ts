import "server-only";
import { getPrisma } from "./prisma";
import { getActiveGame } from "./active-game";

/**
 * Throws if the currently active master is in "game" mode.
 * Use before any write operation on glossary/brain documents.
 * Returns the master's mode for informational use.
 */
export async function assertNotGameMode(): Promise<void> {
  const activeGame = await getActiveGame();
  if (!activeGame) return; // no active game — nothing to guard

  if (activeGame.mode === "game") {
    throw new GameModeReadOnlyError();
  }
}

export class GameModeReadOnlyError extends Error {
  constructor() {
    super("errors.gameModeReadOnly");
    this.name = "GameModeReadOnlyError";
  }
}
