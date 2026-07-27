import { z } from "zod";
import { zodSchema } from "ai";
import { listCachedFiles } from "@/src/shared/lib/agents/file-cache";
import { throwIfCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { TOOL_DESCRIPTIONS } from "@/src/shared/config/prompts/tool-descriptions";

export const listUploadedFilesTool = {
  description: TOOL_DESCRIPTIONS.list_uploaded_files,
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    throwIfCancelled();
    return listCachedFiles();
  },
};
