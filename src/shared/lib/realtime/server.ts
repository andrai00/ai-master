import type { Server, Socket } from "socket.io";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { verifySessionToken, type ISessionPayload } from "@/src/shared/lib/auth/session";
import { getSnapshot } from "@/src/shared/lib/agents/step-tracker";
import { getIO } from "./io";

/**
 * Socket.IO hub. Registered once at server startup via instrumentation.ts.
 *
 * Rooms:
 *   user:{userId}      — per-user broadcasts (kick, access loss)
 *   steps:{sessionId}  — agent step events (step-tracker emits here)
 *   session:{sessionId}— chat rooms for typing indicators
 *   presence:{masterId}— online presence of the active game
 */

export interface IPresenceUser {
  userId: string;
  displayName: string;
  role: string;
}

interface ITypingPayload {
  sessionId: string;
  userId: string;
  displayName: string;
  typing: boolean;
}

const globalRT = globalThis as unknown as {
  __socketHandlersRegistered?: boolean;
  __presence?: Map<string, Set<string>>;
  __presenceInfo?: Map<string, IPresenceUser>;
};

const COOKIE_NAME = "session_token";

function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }
  return undefined;
}

function getPresence(): Map<string, Set<string>> {
  if (!globalRT.__presence) globalRT.__presence = new Map();
  return globalRT.__presence;
}

function getPresenceInfo(): Map<string, IPresenceUser> {
  if (!globalRT.__presenceInfo) globalRT.__presenceInfo = new Map();
  return globalRT.__presenceInfo;
}

function addPresence(socket: Socket, session: ISessionPayload): void {
  const map = getPresence();
  let set = map.get(session.userId);
  if (!set) {
    set = new Set();
    map.set(session.userId, set);
  }
  set.add(socket.id);
  getPresenceInfo().set(session.userId, {
    userId: session.userId,
    displayName: session.displayName || session.login,
    role: session.role,
  });
}

function removePresence(socket: Socket, session: ISessionPayload): void {
  const set = getPresence().get(session.userId);
  if (!set) return;
  set.delete(socket.id);
  if (set.size === 0) {
    getPresence().delete(session.userId);
    getPresenceInfo().delete(session.userId);
  }
}

function onlineUsers(): IPresenceUser[] {
  return [...getPresenceInfo().values()];
}

function emitPresence(io: Server, masterId: string): void {
  io.to(`presence:${masterId}`).emit("presence:update", { masterId, online: onlineUsers() });
}

/**
 * Whether a user may observe step events for a session, mirroring the
 * authorization the old /api/stream route applied per SSE connection.
 */
async function canObserveSession(session: ISessionPayload, sessionId: string): Promise<boolean> {
  const prisma = getPrisma();
  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { masterId: true, type: true, playerId: true },
  });
  if (!s) return false;

  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId ?? null;
  if (!masterId || s.masterId !== masterId) return false;

  const isAdmin = session.role === "admin";
  if (s.type === "personal") return s.playerId === session.userId;
  if (isAdmin) return s.type === "game" || s.type === "builder";

  if (s.type === "game") {
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId } },
    });
    return access !== null;
  }
  return false;
}

function relayTyping(
  io: Server,
  sessionId: string,
  sender: ISessionPayload,
  payload: Omit<ITypingPayload, "sessionId">,
): void {
  const room = io.sockets.adapter.rooms.get(`session:${sessionId}`);
  if (!room) return;
  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    if (s && s.data.session?.userId !== sender.userId) {
      s.emit("typing:indicator", { sessionId, ...payload });
    }
  }
}

async function setupConnection(io: Server, socket: Socket): Promise<void> {
  const session = socket.data.session as ISessionPayload;
  socket.join(`user:${session.userId}`);

  // Presence room for the current active game (recomputed on rejoin after a
  // game switch). The step/session rooms are NOT managed here: membership is
  // driven by the client via "subscribe-steps"/"unsubscribe-steps", which
  // fixes the race where a chat session is created lazily by the page's own
  // server action AFTER the socket connected — the room would otherwise never
  // be joined and every step event for that chat would be silently lost.
  for (const room of socket.rooms) {
    if (room.startsWith("presence:")) {
      socket.leave(room);
    }
  }

  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId ?? null;
  if (masterId) {
    addPresence(socket, session);
    socket.join(`presence:${masterId}`);
    emitPresence(io, masterId);
  }
}

/**
 * Serialize setup runs per socket so concurrent connection/rejoin calls do
 * not interleave their presence leave/join operations.
 */
function scheduleSetup(io: Server, socket: Socket): void {
  const prev = (socket.data.setupChain as Promise<void> | undefined) ?? Promise.resolve();
  socket.data.setupChain = prev
    .catch(() => {})
    .then(() => setupConnection(io, socket));
  void socket.data.setupChain.catch((err: unknown) => {
    console.error("[socket] connection setup failed:", err);
  });
}

/** Idempotent registration of all Socket.IO handlers (runs once per process). */
export function registerSocketHandlers(): void {
  if (globalRT.__socketHandlersRegistered) return;
  globalRT.__socketHandlersRegistered = true;

  let io: Server;
  try {
    io = getIO();
  } catch {
    console.warn("[socket] Socket.IO server not initialized (run via `node server.mjs`) — realtime disabled.");
    return;
  }
  console.log("[socket] Socket.IO handlers registered");

  io.use(async (socket, next) => {
    try {
      const token = readSessionCookie(socket.handshake.headers.cookie);
      const session = token ? await verifySessionToken(token) : null;
      if (!session) return next(new Error("errors.unauthorized"));
      socket.data.session = session;
      next();
    } catch {
      next(new Error("errors.unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const session = socket.data.session as ISessionPayload;

    scheduleSetup(io, socket);

    // Re-evaluate presence after the active game changed (game_switched).
    socket.on("rejoin", () => {
      scheduleSetup(io, socket);
    });

    // The client requests step/session room membership for the chat it is
    // currently showing. Join the rooms and replay a snapshot for a batch
    // already in progress (page opened mid-run).
    socket.on("subscribe-steps", (data: { sessionId?: string }) => {
      const sessionId = data?.sessionId;
      if (!sessionId || typeof sessionId !== "string") return;
      canObserveSession(session, sessionId)
        .then((ok) => {
          if (!ok) return;
          socket.join(`steps:${sessionId}`);
          socket.join(`session:${sessionId}`);

          const snap = getSnapshot(sessionId);
          if (snap?.processing) {
            socket.emit("step", { sessionId, type: "started", seq: snap.seq });
            if (snap.tool) {
              socket.emit("step", { sessionId, type: "step", tool: snap.tool, detail: snap.detail, seq: snap.seq });
            }
          }
        })
        .catch((err) => {
          console.error("[socket] subscribe-steps failed:", err);
        });
    });

    socket.on("unsubscribe-steps", (data: { sessionId?: string }) => {
      const sessionId = data?.sessionId;
      if (!sessionId || typeof sessionId !== "string") return;
      socket.leave(`steps:${sessionId}`);
      socket.leave(`session:${sessionId}`);
    });

    socket.on("typing:start", (data: { sessionId?: string }) => {
      const sessionId = data?.sessionId;
      if (!sessionId || typeof sessionId !== "string") return;
      relayTyping(io, sessionId, session, {
        userId: session.userId,
        displayName: session.displayName || session.login,
        typing: true,
      });
    });

    socket.on("typing:stop", (data: { sessionId?: string }) => {
      const sessionId = data?.sessionId;
      if (!sessionId || typeof sessionId !== "string") return;
      relayTyping(io, sessionId, session, {
        userId: session.userId,
        displayName: session.displayName || session.login,
        typing: false,
      });
    });

    socket.on("disconnect", () => {
      removePresence(socket, session);
      void getActiveGame()
        .then((activeGame) => {
          const masterId = activeGame?.currentMasterId ?? null;
          if (masterId) emitPresence(io, masterId);
        })
        .catch(() => {});
    });
  });
}
