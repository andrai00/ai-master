import { NextResponse } from "next/server";
import { deleteSessionCookie } from "@/src/shared/lib/auth/session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get("redirect") || "/login";

  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  await deleteSessionCookie();
  response.cookies.delete("session_token");
  return response;
}
