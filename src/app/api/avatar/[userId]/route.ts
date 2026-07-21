import { NextResponse } from "next/server";
import { getPrisma } from "@/src/shared/lib/db/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  });

  if (!user || !user.avatar) {
    return new NextResponse("Not found", { status: 404 });
  }

  // avatar is stored as data:image/png;base64,...
  const match = user.avatar.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return new NextResponse("Invalid format", { status: 500 });
  }

  const mime = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    headers: { "Content-Type": mime, "Cache-Control": "no-cache" },
  });
}
