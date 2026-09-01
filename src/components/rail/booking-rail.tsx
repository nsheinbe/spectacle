import Link from "next/link";

import type { Package, UsageRightsOption } from "@/db";
import { formatCents } from "@/lib/utils";

/**
 * The booking rail: platform chrome with its own CONSTANT #1C1710 background
 * (bg-ink), rendered as a route-level sibling of <Stage>. This file may not
 * import src/themes/** — ESLint and verify-themes both enforce the boundary.
 * Desktop: sticky right column. Mobile: bottom sheet.
 */
export function BookingRail({
  packages,
  rights,
  published,
}: {
  packages: Package[];
  rights: UsageRightsOption[];
  published: boolean;
}) {
  const cheapest = packages.length
    ? packages.reduce((a, b) => (a.priceCents <= b.priceCents ? a : b))
    : null;
  // /book/[packageId] requires at least one active usage-rights option — a
  // "Start booking" link that lands on a 404 is worse than saying so here.
  const bookable = rights.length > 0;
  return (
    <aside
      aria-label="Book this creator"
      className="border-t border-line bg-ink text-text lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0"
    >
      <div className="p-5">
        <h2 className="font-display text-2xl">Book this creator</h2>
        {!published && (
          <p className="mt-2 text-sm text-text-muted">This storefront is not published.</p>
        )}
        <ul className="mt-4 space-y-3">
          {packages.map((pkg) => (
            <li key={pkg.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-medium text-text">{pkg.name}</h3>
                <span className="num shrink-0 font-medium text-beam">
                  {formatCents(pkg.priceCents)}
                </span>
              </div>
              {pkg.deliverableSummary && (
                <p className="mt-1 text-sm text-text-muted">{pkg.deliverableSummary}</p>
              )}
              <p className="mt-1 text-xs text-text-faint">
                ~{pkg.turnaroundDays} day turnaround
              </p>
              {bookable ? (
                <Link
                  href={`/book/${pkg.id}`}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center rounded bg-beam px-4 text-sm font-medium text-canvas hover:brightness-110"
                >
                  Start booking
                </Link>
              ) : (
                <p className="mt-3 rounded border border-line px-3 py-2 text-center text-xs text-text-faint">
                  Not bookable yet — usage rights are being set up
                </p>
              )}
            </li>
          ))}
          {packages.length === 0 && (
            <li className="text-sm text-text-muted">No packages yet.</li>
          )}
        </ul>
        {rights.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium uppercase tracking-wide text-text-faint">
              Usage rights
            </h3>
            <ul className="mt-2 space-y-2">
              {rights.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-text-muted">{r.name}</span>
                  <span className="num shrink-0 text-text">
                    {r.priceDeltaCents > 0 ? `+${formatCents(r.priceDeltaCents)}` : "Included"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {cheapest && (
          <p className="mt-6 text-xs leading-relaxed text-text-faint">
            From <span className="num">{formatCents(cheapest.priceCents)}</span> + usage
            rights. Payment happens after a proposal is accepted — Phase 2. No card needed
            today.
          </p>
        )}
      </div>
    </aside>
  );
}
