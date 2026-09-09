import Link from "next/link";

import { getServerSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { LAUNCH_COPY } from "@/lib/launch-copy";

/** Platform chrome — never themed. */
export async function SiteHeader() {
  let session: Awaited<ReturnType<typeof getServerSession>> = null;
  try {
    session = await getServerSession();
  } catch {
    session = null;
  }
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-display text-xl tracking-wide text-text">
          Spectacle
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {env.FEATURE_BROWSE && (
            <Link
              href="/browse"
              className="rounded px-3 py-2 text-text-muted hover:bg-surface hover:text-text"
            >
              {LAUNCH_COPY.browseCta}
            </Link>
          )}
          {session ? (
            <>
              <Link
                href="/dashboard"
                className="rounded px-3 py-2 text-text-muted hover:bg-surface hover:text-text"
              >
                Dashboard
              </Link>
              <Link
                href="/bookings"
                className="rounded px-3 py-2 text-text-muted hover:bg-surface hover:text-text"
              >
                Bookings
              </Link>
              <Link
                href="/settings"
                className="rounded px-3 py-2 text-text-muted hover:bg-surface hover:text-text"
              >
                Settings
              </Link>
            </>
          ) : (
            <Link
              href="/auth"
              className="rounded bg-beam px-4 py-2 font-medium text-canvas hover:brightness-110"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
