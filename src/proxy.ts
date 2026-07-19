import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "session_token";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || "ai-master-dev-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

const publicPaths = ["/login", "/setup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") return NextResponse.next();
  if (publicPaths.includes(pathname)) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname.startsWith("/api")) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
