import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { parseFile } from "@/src/shared/lib/agents/file-parser";
import { cacheFile, setFileParseError } from "@/src/shared/lib/agents/file-cache";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import { ensureSession, emitStep, emitDone } from "@/src/shared/lib/agents/step-tracker";

export const maxDuration = 120;

const MAX_SIZE = 100 * 1024 * 1024;

// In-memory store for in-progress parsing status
const globalParsing = globalThis as unknown as {
  parsingStatus: Map<string, { status: "parsing" | "done" | "error"; error?: string }> | undefined;
};

function getStatusMap(): Map<string, { status: "parsing" | "done" | "error"; error?: string }> {
  if (!globalParsing.parsingStatus) globalParsing.parsingStatus = new Map();
  return globalParsing.parsingStatus;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "errors.unauthorized" }, { status: 401 });
  }

  const contentLength = request.headers.get("content-length");
  console.log(`[upload] Content-Length: ${contentLength ?? "not set"}`);
  if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
    return NextResponse.json({
      error: `errors.fileTooLargeBytes: ${Math.round(parseInt(contentLength, 10) / 1024 / 1024)}MB. Limit is 100MB.`,
    }, { status: 413 });
  }

  let formData: FormData;
  try {
    console.log("[upload] Parsing formData...");
    formData = await request.formData();
    console.log("[upload] formData parsed OK");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[upload] formData parse failed:", msg);
    return NextResponse.json({
      error: `errors.readFileFailed: ${msg}. The file might be too large, or the request was interrupted.`,
    }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "errors.noFileProvided" }, { status: 400 });
  }

  console.log(`[upload] File received: ${file.name} (${file.size} bytes)`);

  const fileId = crypto.randomUUID();
  const statusMap = getStatusMap();
  statusMap.set(fileId, { status: "parsing" });

  const prisma = getPrisma();
  const activeGame = await getActiveGame();

  // Get builder session for SSE step tracking (shows parsing bubble in chat)
  let sessionId: string | undefined;
  if (activeGame?.currentMasterId) {
    const s = await prisma.session.findFirst({
      where: { masterId: activeGame.currentMasterId, type: "builder" },
      select: { id: true },
    });
    sessionId = s?.id;
  }
  if (sessionId) {
    ensureSession(sessionId);
    emitStep(sessionId, "file_parsing", `${file.name}: parsing`);
  }

  // Parse in background via worker — main thread stays responsive
  const buffer = Buffer.from(await file.arrayBuffer());
  console.log(`[upload] Buffer: ${buffer.length} bytes, starting background parse`);

  parseFile(buffer, file.name, sessionId ? (elapsed) => {
    emitStep(sessionId!, "file_parsing", `${file.name}: ${elapsed}s`);
  } : undefined)
    .then(async (parsed) => {
      cacheFile(fileId, parsed.text, parsed.size, file.name);

      // Create DB record only after successful parse — files without text don't appear in lists
      if (activeGame?.currentMasterId) {
        try {
          await prisma.uploadedFile.create({
            data: {
              id: fileId,
              masterId: activeGame.currentMasterId,
              filename: file.name,
              text: parsed.text,
              size: parsed.size,
              status: "done",
            },
          });
          broadcastGameEvent("file_uploaded", { fileId });
        } catch (dbErr) {
          console.error(`[upload] Failed to save parsed file to DB: ${dbErr}`);
        }
      }

      statusMap.set(fileId, { status: "done" });
      console.log(`[upload] Background parse done: ${parsed.size} chars, fileId=${fileId}`);

      if (sessionId) {
        emitStep(sessionId, "file_parsing", `${file.name}: ${Math.round(parsed.size / 1024)}K chars`);
        const stillParsing = Array.from(statusMap.values()).some((s) => s.status === "parsing");
        if (!stillParsing) emitDone(sessionId);
      }
    })
    .catch(async (err) => {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[upload] Background parse failed: ${msg}`);
      setFileParseError(fileId, msg);
      statusMap.set(fileId, { status: "error", error: msg });

      if (sessionId) {
        emitStep(sessionId, "file_parsing", `${file.name}: error`);
        const stillParsing = Array.from(statusMap.values()).some((s) => s.status === "parsing");
        if (!stillParsing) emitDone(sessionId);
      }
    });

  return NextResponse.json({ fileId, filename: file.name, size: file.size, status: "parsing" });
}

// Status check endpoint
export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "errors.missingParam" }, { status: 400 });

  const status = getStatusMap().get(fileId);
  if (!status) return NextResponse.json({ error: "errors.unknownFileId" }, { status: 404 });

  return NextResponse.json(status);
}
