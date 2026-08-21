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
 * Session rooms this user is allowed to observe, mirroring the authorization
 * the old /api/stream route applied per SSE connection.
 */
async function getObservableStepSessions(session: ISessionPayload): Promise<string[]> {
  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId ?? null;
  const ids: string[] = [];
  if (!masterId) return ids;

  const isAdmin = session.role === "admin";

  const personal = await prisma.session.findFirst({
    where: { playerId: session.userId, type: "personal", masterId },
    select: { id: true },
  });
  if (personal) ids.push(personal.id);

  if (isAdmin) {
    const gameSession = await prisma.session.findFirst({
      where: { masterId, type: "game" },
      select: { id: true },
    });
    if (gameSession) ids.push(gameSession.id);

    const builderSession = await prisma.session.findFirst({
      where: { masterId, type: "builder" },
      select: { id: true },
    });
    if (builderSession) ids.push(builderSession.id);
  } else {
    const access = await prisma.gameAccess.findUnique({
      where: { userId_masterId: { userId: session.userId, masterId } },
    });
    if (access) {
      const gameSession = await prisma.session.findFirst({
        where: { masterId, type: "game" },
        select: { id: true },
      });
      if (gameSession) ids.push(gameSession.id);
    }
  }
  return ids;
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

  // Re-join from scratch: leave old rooms (reconnect after game switch).
  for (const room of socket.rooms) {
    if (room.startsWith("steps:") || room.startsWith("session:") || room.startsWith("presence:")) {
      socket.leave(room);
    }
  }

  const stepSessionIds = await getObservableStepSessions(session);
  socket.data.stepSessionIds = stepSessionIds;
  for (const sid of stepSessionIds) {
    socket.join(`steps:${sid}`);
    socket.join(`session:${sid}`);
  }

  // Replay a snapshot for a batch already in progress (page opened mid-run).
  for (const sid of stepSessionIds) {
    const snap = getSnapshot(sid);
    if (snap?.processing) {
      socket.emit("step", { sessionId: sid, type: "started", seq: snap.seq });
      if (snap.tool) {
        socket.emit("step", { sessionId: sid, type: "step", tool: snap.tool, detail: snap.detail, seq: snap.seq });
      }
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

    setupConnection(io, socket).catch((err) => {
      console.error("[socket] connection setup failed:", err);
    });

    // Re-evaluate rooms after the active game changed (game_switched).
    socket.on("rejoin", () => {
      setupConnection(io, socket).catch((err) => {
        console.error("[socket] rejoin failed:", err);
      });
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
