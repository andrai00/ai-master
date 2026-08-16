import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const builderGetSceneStateTool = {
  description:
    "Read the CURRENT SCENE (game_hidden, type 'scene'): where the party is, NPCs present, atmosphere, active effects. Use in MEMORY mode when setting up or migrating game state.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    const activeGame = await getActiveGame();
    if (!activeGame) throw new Error("errors.noGame");

    const prisma = getPrisma();
    const doc = await prisma.document.findFirst({
      where: { masterId: activeGame.currentMasterId, category: "game_hidden", type: "scene", status: "active" },
      select: { id: true, title: true, content: true, updatedAt: true },
    });

    return doc
      ? { id: doc.id, title: doc.title, content: doc.content, updatedAt: doc.updatedAt.toISOString() }
      : { scene: null };
  },
};
