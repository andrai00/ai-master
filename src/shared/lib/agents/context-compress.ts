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
  read_lines: "read document lines",
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
 * keeps the system message, the LAST plain user message, and the LAST tool
 * step (assistant tool-call + its tool-result pair — never corrupt the
 * conversation), and replaces everything before it with a summary of tool
 * activity:
 *   "[Compressed — previous steps]. Created 12 documents. Updated 3 documents."
 *
 * The compressed array is guaranteed to be VALID for the API: it never ends
 * with a dangling tool-result, and tool-call/tool-result pairs stay intact.
 * Returns `null` when compression is not needed.
 */
export function compressMessages({ messages, steps, threshold }: ICompressInput): { messages: ModelMessage[] } | null {
  const totalChars = messages.reduce((sum, m) => {
    if (typeof m.content === "string") return sum + m.content.length;
    if (Array.isArray(m.content)) {
      return sum + (m.content as Array<{ text?: string; input?: unknown }>).reduce(
        (s, p) => s + (typeof p.text === "string" ? p.text.length : 0),
        0
      );
    }
    return sum;
  }, 0);
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
  const userMsgs = messages.filter(
    (m) => m.role === "user" && typeof m.content === "string"
  );
  const lastUser = userMsgs[userMsgs.length - 1];

  const compressed: ModelMessage[] = [];
  if (systemMsg) compressed.push(systemMsg);
  if (lastUser) compressed.push(lastUser);
  compressed.push({ role: "assistant", content: summary });

  // Keep the LAST tool step (assistant tool-call + its tool-result pair) intact
  // so the conversation stays valid and the model still sees the current data.
  let cutFrom = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const parts = m.content as Array<{ type?: string }>;
      if (parts.some((p) => p.type === "tool-call")) {
        cutFrom = i;
        break;
      }
    }
  }
  if (cutFrom > -1) {
    for (let i = cutFrom; i < messages.length; i++) compressed.push(messages[i]);
  } else {
    // No tool step to preserve — append the last message only if it is plain text.
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg !== lastUser && typeof lastMsg.content === "string") {
      compressed.push(lastMsg);
    }
  }

  return { messages: compressed.filter(Boolean) as ModelMessage[] };
}
