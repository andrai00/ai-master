import type { ModelMessage } from "ai";

interface ICompressInput {
  messages: ModelMessage[];
  steps?: Array<{ toolCalls?: Array<{ toolName?: string }> }>;
  threshold: number;
  maxTokensPerMsg?: number;
}

const TOOL_LABELS: Record<string, string> = {
  create_document: "created documents",
  update_document: "updated documents",
  search_rules: "searched rules",
  bulk_import_to_glossary: "bulk-imported archives",
  list_uploaded_files: "listed files",
  write_note: "wrote notes",
  update_char_sheet: "updated sheets",
  set_scene_state: "set scene state",
  present_roll_check: "assigned rolls",
  confirm_rolls: "confirmed rolls",
  get_gm_notes: "read gm notes",
  get_player_sheet: "read sheets",
  read_document: "read documents",
  get_brain: "read brain",
  get_rolls: "read rolls",
  get_scene_state: "read scene",
  get_players: "read players",
  resolve_glossary_link: "resolved links",
};

/**
 * Universal context compression for agent runners (GM + Builder).
 *
 * Estimates token count as chars/4. If the estimate exceeds `threshold`,
 * keeps the system message, the LAST user message and the LAST tool step
 * (the one being processed — never compress it), and replaces everything
 * in between with a summary of tool activity:
 *   "[Compressed — previous steps]. Created 12 documents. Updated 3 documents."
 *
 * Returns `null` when compression is not needed.
 */
export function compressMessages({ messages, steps, threshold }: ICompressInput): { messages: ModelMessage[] } | null {
  const totalChars = messages.reduce(
    (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
    0
  );
  const estimatedTokens = totalChars / 4;
  if (estimatedTokens < threshold) return null;

  // Count tool activity across all finished steps for the summary line.
  const counts: Record<string, number> = {};
  for (const step of steps ?? []) {
    for (const call of step.toolCalls ?? []) {
      if (call.toolName) counts[call.toolName] = (counts[call.toolName] ?? 0) + 1;
    }
  }
  const summaryParts: string[] = [];
  for (const [tool, count] of Object.entries(counts)) {
    const label = TOOL_LABELS[tool] ?? `${tool.replace(/_/g, " ")} calls`;
    summaryParts.push(`${count} ${label}`);
  }
  const summary =
    "[Compressed — previous steps]" +
    (summaryParts.length > 0 ? `. ${summaryParts.join(". ")}.` : ".");

  const systemMsg = messages.find((m) => m.role === "system");
  const userMsgs = messages.filter((m) => m.role === "user");
  const lastUser = userMsgs[userMsgs.length - 1];
  const lastMsg = messages[messages.length - 1];

  const compressed: ModelMessage[] = [];
  if (systemMsg) compressed.push(systemMsg);
  if (lastUser) compressed.push(lastUser);
  compressed.push({ role: "assistant", content: summary });
  // The last message is the current tool step's output — keep it untouched.
  if (lastMsg && lastMsg !== lastUser) compressed.push(lastMsg);

  return { messages: compressed.filter(Boolean) as ModelMessage[] };
}
