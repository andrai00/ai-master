import { NextRequest } from "next/server";
import { appendFileSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      tag?: string;
      message?: string;
      extra?: unknown;
    };
    const tag = body.tag ?? "client";
    const message = body.message ?? "";
    const extra = body.extra;
    const now = new Date();
    const extraStr =
      extra === undefined
        ? ""
        : " " + (typeof extra === "string" ? extra : JSON.stringify(extra));
    const line = `${now.toISOString()} ${now.getTime()} [CLI:${tag}] ${message}${extraStr}`;
    appendFileSync(path.join(process.cwd(), "debug-rolls.log"), line + "\n", "utf8");
    return new Response("ok", { status: 200 });
  } catch {
    return new Response("bad request", { status: 400 });
  }
}
