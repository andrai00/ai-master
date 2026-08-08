import { NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";
import { getActiveGame } from "@/src/shared/lib/db/active-game";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "errors.unauthorized" }, { status: 401 });
  }

  const activeGame = await getActiveGame();
  const masterId = activeGame?.currentMasterId;
  if (!masterId) {
    return NextResponse.json({ error: "errors.noActiveGame" }, { status: 400 });
  }

  const prisma = getPrisma();

  const master = await prisma.master.findUnique({
    where: { id: masterId },
    select: { name: true },
  });

  const docs = await prisma.document.findMany({
    where: {
      masterId,
      category: { in: ["glossary", "brain"] },
      status: "active",
    },
    select: {
      title: true,
      type: true,
      category: true,
      content: true,
      tags: true,
      summary: true,
    },
    orderBy: [{ category: "asc" }, { type: "asc" }, { title: "asc" }],
  });

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    gameName: master?.name ?? "unknown",
    documentCount: docs.length,
    documents: docs.map((d) => ({
      title: d.title,
      type: d.type,
      category: d.category,
      content: d.content,
      tags: JSON.parse(d.tags),
      summary: d.summary,
    })),
  };

  return NextResponse.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename="ai-master-export-${master?.name ?? "game"}.json"`,
    },
  });
}
