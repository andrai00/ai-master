import { NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import fs from "fs";
import path from "path";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dir = path.join(process.cwd(), "data", "avatars");
  if (!fs.existsSync(dir)) return NextResponse.json({ success: true });

  const files = fs.readdirSync(dir).filter((f) => f.startsWith(session.userId));
  for (const file of files) {
    fs.unlinkSync(path.join(dir, file));
  }

  return NextResponse.json({ success: true });
}
