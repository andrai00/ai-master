import { NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only images allowed" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const dataUri = `data:${file.type};base64,${base64}`;

  const prisma = getPrisma();
  await prisma.user.update({
    where: { id: session.userId },
    data: { avatar: dataUri },
  });

  return NextResponse.json({ avatarPath: `/api/avatar/${session.userId}` });
}
