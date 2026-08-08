import { getPrisma } from "@/src/shared/lib/db/prisma";

export async function resolveDocId(idOrPath: string): Promise<string | null> {
  if (idOrPath.includes("/") || idOrPath.endsWith(".md")) {
    const cleanPath = idOrPath.replace(/\.md$/i, "").replace(/^\//, "");
    const prisma = getPrisma();
    const resolved = await prisma.document.findFirst({
      where: { title: cleanPath, status: "active" },
      select: { id: true },
    });
    return resolved?.id ?? null;
  }
  return idOrPath;
}
