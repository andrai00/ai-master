import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export const deleteUploadedFilesTool = {
  description: "Delete uploaded files from the database by their IDs or by folder path. Use this after single-file imports to clean up, or to remove specific files before import. With folderPath — deletes all files in that folder. With fileIds — deletes specific files.",
  inputSchema: zodSchema(
    z.object({
      folderPath: z.string().optional().describe("Delete all files in this folder path"),
      fileIds: z.array(z.string()).optional().describe("Delete specific files by ID"),
    })
  ),
  execute: async (args: { folderPath?: string; fileIds?: string[] }) => {
    if (isCancelled()) throw new Error("errors.cancelled");

    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId;
    if (!masterId) throw new Error("errors.noActiveGameTool");

    const prisma = getPrisma();

    if (args.folderPath) {
      const result = await prisma.uploadedFile.deleteMany({
        where: { masterId, path: args.folderPath },
      });
      return { deleted: result.count, folderPath: args.folderPath };
    }

    if (args.fileIds && args.fileIds.length > 0) {
      const result = await prisma.uploadedFile.deleteMany({
        where: { masterId, id: { in: args.fileIds } },
      });
      return { deleted: result.count, fileIds: args.fileIds };
    }

    return { deleted: 0, note: "No folderPath or fileIds provided" };
  },
};
