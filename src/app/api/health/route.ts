import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Process-up smoke check for Ops. Unauthenticated, no DB — a 200 here means
 * the Next.js process is serving, not that Neon or auth is reachable.
 */
export function GET() {
  return NextResponse.json({ ok: true });
}
