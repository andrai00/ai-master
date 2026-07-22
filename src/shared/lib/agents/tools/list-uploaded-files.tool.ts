import { z } from "zod";
import { zodSchema } from "@ai-sdk/provider-utils";
import { listCachedFiles } from "@/src/shared/lib/agents/file-cache";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";

export const listUploadedFilesTool = {
  description: "List all uploaded files currently in the cache (fileId, filename, size).",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    if (isCancelled()) throw new Error("Cancelled.");
    return listCachedFiles();
  },
};
