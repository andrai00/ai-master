/**
 * Next.js server-side instrumentation — runs once when the server starts.
 * Registers the Socket.IO connection handlers on the shared io instance
 * created by server.js (globalThis.__socketIO).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerSocketHandlers } = await import("./shared/lib/realtime/server");
  registerSocketHandlers();
}
