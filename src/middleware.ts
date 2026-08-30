import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Route guards, edge layer: no session cookie → /auth for every protected
 * surface. Finer checks (no profile yet → role selection; role mismatch →
 * /dashboard) happen in the server layouts, which can read the database.
 * Public: /, /auth, /c/[slug] storefronts, api auth + local-storage routes.
 */
export function middleware(request: NextRequest) {
  const cookie = getSessionCookie(request);
  if (!cookie) {
    const url = new URL("/auth", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/bookings/:path*", "/book/:path*", "/onboarding/:path*"],
};
