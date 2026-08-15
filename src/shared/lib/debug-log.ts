import "server-only";
import { appendFileSync } from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "debug-rolls.log");

function stringify(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function debugLog(tag: string, message: string, extra?: unknown): void {
  const now = new Date();
  const extraStr = extra !== undefined ? " " + stringify(extra) : "";
  const line = `${now.toISOString()} ${now.getTime()} [SRV:${tag}] ${message}${extraStr}`;
  try {
    appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch {
    // ignore logging failures
  }
  console.log("[debug]", line);
}
