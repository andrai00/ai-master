import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";
import { broadcastGameEvent } from "@/src/shared/lib/events/game-events";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "errors.unauthorized" }, { status: 401 });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
    return NextResponse.json({ error: "errors.fileTooLarge" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "errors.readFileFailed" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "errors.noFileProvided" }, { status: 400 });
  }

  let data: { version?: number; documents?: Array<{ title: string; type: string; category: string; content: string; tags?: string[]; summary?: string | null }> };
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "errors.invalidJson" }, { status: 400 });
  }

  if (!data.documents || !Array.isArray(data.documents) || data.documents.length === 0) {
    return NextResponse.json({ error: "errors.invalidFormat" }, { status: 400 });
  }

  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;
  if (!masterId) {
    return NextResponse.json({ error: "errors.noActiveGame" }, { status: 400 });
  }

  const prisma = getPrisma();

  // Check existing documents
  const existingCount = await prisma.document.count({
    where: { masterId, category: { in: ["glossary", "brain"] } },
  });

  const confirmOverwrite = request.headers.get("x-confirm-overwrite") === "true";
  if (existingCount > 0 && !confirmOverwrite) {
    return NextResponse.json({
      error: "errors.confirmOverwrite",
      existingCount,
      importCount: data.documents.length,
    }, { status: 409 });
  }

  // Delete all existing brain + glossary documents
  await prisma.document.deleteMany({
    where: { masterId, category: { in: ["glossary", "brain"] } },
  });

  // Import new documents
  const documents = data.documents
    .filter((d) => d.category === "glossary" || d.category === "brain")
    .map((d) => ({
      masterId,
      title: d.title,
      type: d.type || "note",
      category: d.category,
      content: d.content,
      tags: JSON.stringify(d.tags ?? []),
      summary: d.summary ?? null,
    }));

  if (documents.length > 0) {
    await prisma.document.createMany({ data: documents });
  }

  broadcastGameEvent("document_updated", { masterId });

  return NextResponse.json({
    success: true,
    replaced: existingCount,
    imported: documents.length,
  });
}
