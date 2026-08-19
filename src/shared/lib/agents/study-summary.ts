/** Read-only tools whose results may be carried from Pass 1 (planning) into
 * Pass 2 (execution) so the model does not re-read the same data. */

export const STUDY_SUMMARY_CAP = 12_000;
export const STUDY_SUMMARY_PER_RESULT = 1_500;

/** Builds a compact "study summary" from Pass 1 tool results — the data the
 * model already read — so Pass 2 does not re-read the same documents.
 * Only tool outputs whose names are in `allowedTools` are included; results
 * are capped per entry and in total. */
export function buildStudySummary(
  toolResults: Array<{ toolName?: string; output?: unknown }>,
  allowedTools: Set<string>
): string {
  const lines: string[] = [];
  let total = 0;
  for (const tr of toolResults) {
    const name = tr.toolName;
    if (!name || !allowedTools.has(name)) continue;
    if (tr.output === undefined || tr.output === null) continue;
    let text: string;
    try {
      text = typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output);
    } catch {
      text = String(tr.output);
    }
    if (text.length > STUDY_SUMMARY_PER_RESULT) {
      text = text.slice(0, STUDY_SUMMARY_PER_RESULT) + `…<truncated ${text.length - STUDY_SUMMARY_PER_RESULT}>`;
    }
    lines.push(`- ${name}: ${text}`);
    total += text.length;
    if (total >= STUDY_SUMMARY_CAP) break;
  }
  return lines.join("\n");
}
