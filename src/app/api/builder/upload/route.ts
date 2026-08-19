import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";
import AdmZip from "adm-zip";

export const maxDuration = 60;

const MAX_SIZE = 100 * 1024 * 1024;

function getDirname(entryName: string): string {
  const lastSlash = entryName.lastIndexOf("/");
  return lastSlash === -1 ? "" : "/" + entryName.slice(0, lastSlash);
}

function getBasename(entryName: string): string {
  const lastSlash = entryName.lastIndexOf("/");
  return lastSlash === -1 ? entryName : entryName.slice(lastSlash + 1);
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
    formData = await request.formData();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[upload] formData parse failed:", msg);
    return NextResponse.json({
      error: `errors.readFileFailed: ${msg}`,
    }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "errors.noFileProvided" }, { status: 400 });
  }

  console.log(`[upload] File received: ${file.name} (${file.size} bytes)`);

  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const prisma = getPrisma();
  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;

  if (ext === ".md") {
    const text = await file.text();
    if (!masterId) {
      return NextResponse.json({ error: "errors.noActiveGame" }, { status: 400 });
    }

    const fileId = crypto.randomUUID();

    await prisma.uploadedFile.create({
      data: {
        id: fileId,
        masterId,
        filename: file.name,
        text,
        size: text.length,
        path: "",
        status: "ready",
      },
    });

    broadcastGameEvent("file_uploaded", {});

    return NextResponse.json({ fileId, filename: file.name, size: text.length, status: "ready" });
  }

  if (ext === ".zip") {
    const buffer = Buffer.from(await file.arrayBuffer());

    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch (err: unknown) {
      console.error("[upload] ZIP parse failed:", err);
      return NextResponse.json({ error: "errors.zipParseFailed" }, { status: 400 });
    }

    const entries = zip.getEntries();
    const mdEntries: Array<{ filename: string; path: string; text: string; size: number }> = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (!name.toLowerCase().endsWith(".md")) continue;

      const text = entry.getData().toString("utf-8");
      mdEntries.push({
        filename: getBasename(name),
        path: getDirname(name),
        text,
        size: text.length,
      });
    }

    console.log(`[upload] ZIP extracted: ${mdEntries.length} .md files`);

    if (mdEntries.length === 0) {
      return NextResponse.json({ error: "errors.noMdFilesInArchive" }, { status: 400 });
    }

    if (masterId) {
      await prisma.uploadedFile.createMany({
        data: mdEntries.map((e) => ({
          masterId,
          filename: e.filename,
          text: e.text,
          size: e.size,
          path: e.path,
          status: "ready",
        })),
      });
    }

    const folders = [...new Set(mdEntries.map((e) => e.path))].sort();

    broadcastGameEvent("archive_uploaded", { fileCount: mdEntries.length, folders });

    return NextResponse.json({
      fileId: "__archive__",
      filename: file.name,
      status: "ready",
      fileCount: mdEntries.length,
      folders,
    });
  }

  return NextResponse.json({ error: "errors.unsupportedFileType" }, { status: 400 });
}
