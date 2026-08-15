"use client";

export function clientLog(tag: string, message: string, extra?: unknown): void {
  try {
    void fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, message, extra }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore logging failures
  }
}
