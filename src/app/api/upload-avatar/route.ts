import { NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import fs from "fs";
import path from "path";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only images allowed" }, { status: 400 });

  const dir = path.join(process.cwd(), "data", "avatars");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const ext = file.type.split("/")[1] || "png";
  const filename = `${session.userId}.${ext}`;
  const filepath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filepath, buffer);

  return NextResponse.json({ avatarPath: `/api/avatar/${filename}` });
}
