import { z } from "zod";
import { zodSchema } from "ai";
import { isCancelled } from "@/src/shared/lib/agents/parse-cancel";
import { scanAllLinks } from "./wiki-links-lib";

export const scanWikiLinksTool = {
  description: "Scan all glossary documents for links that can be auto-replaced with [[document-id]] references. Finds both [[wiki-links]] and [text](/path) markdown links with relative URLs. Matches by the last path segment against document titles in the database. Returns total count (wiki + markdown), matched/unmatched, and sample links.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    if (isCancelled()) throw new Error("errors.cancelled");
    const result = await scanAllLinks();
    return result;
  },
};
