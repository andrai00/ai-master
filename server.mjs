// Custom Next.js entry point that shares the same HTTP server and port
// with Socket.IO (WebSocket + long-polling fallback). Runs outside the
// Next.js compiler (ESM, not bundled).
//
// The Socket.IO server instance lives on globalThis (`__socketIO`) so app
// modules (game-events, step-tracker) can emit to clients via getIO() —
// see src/shared/lib/realtime/io.ts and the G2 singleton pattern.
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3015", 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// Bind Socket.IO to the same HTTP server as Next.js. engine.io intercepts
// requests/upgrades on its path (/socket.io/) and forwards everything else
// to the Next.js handler — the official Socket.IO + Next.js pattern.
const httpServer = createServer((req, res) => handler(req, res));

if (!globalThis.__socketIO) {
  globalThis.__socketIO = new Server(httpServer, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });
}

app.prepare().then(() => {
  httpServer
    .once("error", (err) => {
      console.error("[server]", err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
