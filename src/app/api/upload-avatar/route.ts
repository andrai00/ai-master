import { NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { getPrisma } from "@/src/shared/lib/db/prisma";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "errors.unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "errors.noFileProvided" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "errors.fileTooLarge" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "errors.onlyImagesAllowed" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const dataUri = `data:${file.type};base64,${base64}`;

  const prisma = getPrisma();
  await prisma.user.update({
    where: { id: session.userId },
    data: { avatar: dataUri },
  });

  return NextResponse.json({ avatarPath: dataUri });
}
