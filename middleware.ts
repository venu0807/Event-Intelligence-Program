import { NextRequest, NextResponse } from "next/server";

// Cookie name must match the one in lib/auth.ts
const COOKIE_NAME = "eip_session";
const PROTECTED   = ["/dashboard"];
const AUTH_PAGES  = ["/login", "/register"];

/**
 * Middleware runs on the Edge runtime where Node.js crypto is unavailable.
 * We do NOT call jsonwebtoken here — that runs only in Node.js API routes.
 * Here we just check cookie presence as a fast gate; the API routes
 * do full JWT cryptographic verification on every authenticated request.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession   = !!req.cookies.get(COOKIE_NAME)?.value;

  if (PROTECTED.some((p) => pathname.startsWith(p)) && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (AUTH_PAGES.includes(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
