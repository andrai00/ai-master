import type { Server } from "socket.io";

const globalIO = globalThis as unknown as {
  __socketIO?: Server;
};

/**
 * Returns the shared Socket.IO server instance created by server.js.
 * Follows the G2 globalThis singleton pattern: the instance is created once
 * at process start (custom server) and reused across module re-evaluations
 * (dev HMR, server restarts).
 */
export function getIO(): Server {
  const io = globalIO.__socketIO;
  if (!io) {
    throw new Error("Socket.IO server is not initialized — run the app via `node server.mjs`.");
  }
  return io;
}
