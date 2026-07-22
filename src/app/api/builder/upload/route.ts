import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/shared/lib/auth/session";
import { parseFile } from "@/src/shared/lib/agents/file-parser";
import { cacheFile } from "@/src/shared/lib/agents/file-cache";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseFile(buffer, file.name);

    const fileId = cacheFile(parsed.filename, parsed.text, parsed.size);

    // Return a preview (first 200 chars)
    const preview = parsed.text.slice(0, 200);

    return NextResponse.json({
      fileId,
      filename: parsed.filename,
      size: parsed.size,
      preview,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
