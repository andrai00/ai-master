import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { parseFile } from "@/src/shared/lib/agents/file-parser";
import { cacheFile, setFileParseError } from "@/src/shared/lib/agents/file-cache";

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

  // Generate fileId immediately, return it to client
  const fileId = crypto.randomUUID();
  const statusMap = getStatusMap();
  statusMap.set(fileId, { status: "parsing" });

  // Parse in background — don't block the response
  const buffer = Buffer.from(await file.arrayBuffer());
  console.log(`[upload] Buffer: ${buffer.length} bytes, starting background parse`);

  parseFile(buffer, file.name)
    .then((parsed) => {
      cacheFile(fileId, parsed.text, parsed.size, file.name);
      statusMap.set(fileId, { status: "done" });
      console.log(`[upload] Background parse done: ${parsed.size} chars, fileId=${fileId}`);
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[upload] Background parse failed: ${msg}`);
      setFileParseError(fileId, msg);
      statusMap.set(fileId, { status: "error", error: msg });
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
