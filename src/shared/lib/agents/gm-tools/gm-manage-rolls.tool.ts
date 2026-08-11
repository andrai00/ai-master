import { z } from "zod";
import { zodSchema } from "ai";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

export const gmRemoveRollTool = {
  description: "Cancel/remove an assigned or completed roll. The roll will disappear from the player's UI.",
  inputSchema: zodSchema(
    z.object({
      rollId: z.string().describe("ID of the roll to remove"),
    })
  ),
  execute: async (args: { rollId: string }) => {
    const prisma = getPrisma();
    const roll = await prisma.roll.findUnique({ where: { id: args.rollId }, select: { id: true, sessionId: true, status: true } });
    if (!roll) throw new Error("errors.rollNotFound");

    await prisma.roll.update({ where: { id: args.rollId }, data: { status: "cancelled" } });
    broadcastGameEvent("roll_removed", { sessionId: roll.sessionId, rollId: args.rollId });
    return { removed: true, rollId: args.rollId };
  },
};

export const gmConfirmRollsTool = {
  description: "Confirm/acknowledge completed rolls so they don't appear in future get_rolls calls. Call this after you've processed the results.",
  inputSchema: zodSchema(
    z.object({
      rollIds: z.array(z.string()).optional().describe("Specific roll IDs to confirm. Omit to confirm ALL completed unconsumed rolls."),
    })
  ),
  execute: async (args: { rollIds?: string[] }) => {
    const prisma = getPrisma();
    const where: Record<string, unknown> = { status: "completed", consumed: false };
    if (args.rollIds?.length) where.id = { in: args.rollIds };

    const result = await prisma.roll.updateMany({ where, data: { consumed: true } });
    return { confirmed: result.count };
  },
};
