import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const dir = path.join(process.cwd(), "data", "avatars");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(userId));

  if (files.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filepath = path.join(dir, files[0]);
  const buffer = fs.readFileSync(filepath);
  const ext = path.extname(files[0]).slice(1);
  const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;

  return new NextResponse(buffer, {
    headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" },
  });
}
