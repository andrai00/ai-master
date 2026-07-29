import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";

export const listUploadedFilesTool = {
  description: TOOL_DESCRIPTIONS.list_uploaded_files,
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    if (isCancelled()) throw new Error("errors.cancelled");
    const activeGame = await getActiveGame();
    const masterId = activeGame?.currentMasterId;
    if (!masterId) return [];

    const prisma = getPrisma();
    return prisma.uploadedFile.findMany({
      where: { masterId },
      select: { id: true, filename: true, size: true, lastReadOffset: true, status: true },
      orderBy: { createdAt: "asc" },
    }).then((files) =>
      files.map((f) => {
        const totalChunks = Math.ceil(f.size / 5000);
        const chunkNum = f.lastReadOffset > 0
          ? Math.min(Math.ceil(f.lastReadOffset / 5000), totalChunks)
          : 0;
        return {
          id: f.id,
          filename: f.filename,
          size: f.size,
          lastReadOffset: f.lastReadOffset,
          status: f.status,
          chunkNum,
          totalChunks,
          completed: f.status === "done" && f.lastReadOffset >= f.size,
        };
      })
    );
  },
};
