"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatTurnaround } from "@/lib/launch-copy";
import { cn, formatCents } from "@/lib/utils";

export type RailPackage = {
  id: string;
  name: string;
  priceCents: number;
  turnaroundDays: number;
  deliverableSummary: string;
};

export type RailRights = {
  id: string;
  name: string;
  description: string;
  priceDeltaCents: number;
};

/**
 * Design booking rail — locked chrome. Background is constant #1C1710
 * (bg-ink). This file may not import src/themes/**.
 *
 * Desktop: sticky right column. Mobile: price bar + expand-to-sheet.
 * Totals are package + selected usage rights. Request booking goes to the
 * real /book/[packageId] flow. Nothing is charged here.
 */
export function BookingRail({
  creatorName,
  packages,
  rights,
  published,
}: {
  creatorName?: string;
  packages: RailPackage[];
  rights: RailRights[];
  published: boolean;
}) {
  const [pkgIndex, setPkgIndex] = useState(0);
  const [rightsIndex, setRightsIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const selectedPkg = packages[Math.min(pkgIndex, Math.max(packages.length - 1, 0))];
  const selectedRights = rights[Math.min(rightsIndex, Math.max(rights.length - 1, 0))];
  const bookable = published && packages.length > 0 && rights.length > 0;

  const total = useMemo(() => {
    if (!selectedPkg) return 0;
    return selectedPkg.priceCents + (selectedRights?.priceDeltaCents ?? 0);
  }, [selectedPkg, selectedRights]);

  const breakdown = selectedPkg
    ? `${formatCents(selectedPkg.priceCents)} package${
        selectedRights && selectedRights.priceDeltaCents > 0
          ? ` + ${formatCents(selectedRights.priceDeltaCents)} usage`
          : " · included usage"
      }`
    : "";

  const bookHref = selectedPkg ? `/book/${selectedPkg.id}` : "/auth";

  return (
    <>
      {expanded && (
        <button
          type="button"
          aria-label="Collapse booking"
          className="fixed inset-0 z-[90] bg-black/60 lg:hidden"
          onClick={() => setExpanded(false)}
        />
      )}

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-[95] flex items-center gap-3 border-t border-white/10 bg-ink px-4 py-3 shadow-[0_-18px_50px_rgba(0,0,0,.45)] lg:hidden",
          expanded && "hidden",
        )}
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          aria-label="Configure booking"
          className="flex flex-1 flex-col items-start gap-0.5 text-left"
          onClick={() => setExpanded(true)}
        >
          <span className="flex items-baseline gap-1.5">
            <span className="num text-[19px] font-bold text-text-strong">
              {selectedPkg ? formatCents(total) : "—"}
            </span>
            <span className="text-xs text-text-faint">total</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            {selectedPkg?.name ?? "No packages"}
            <svg width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden>
              <path d="M1 1L4.5 4.5L8 1" stroke="#8C806E" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </span>
        </button>
        {bookable ? (
          <Link
            href={bookHref}
            className="inline-flex h-[46px] items-center rounded-md bg-beam px-5 text-[15px] font-semibold text-[#17130e] hover:bg-beam-hover"
          >
            Request booking
          </Link>
        ) : (
          <span className="inline-flex h-[46px] items-center rounded-md border border-line px-4 text-xs text-text-faint">
            Not bookable
          </span>
        )}
      </div>

      <aside
        aria-label="Book this creator"
        className={cn(
          "border-t border-white/10 bg-ink text-text lg:sticky lg:top-[90px] lg:h-fit lg:w-[380px] lg:shrink-0 lg:border-0 lg:bg-transparent",
          expanded
            ? "fixed inset-x-0 bottom-0 z-[100] lg:static"
            : "hidden lg:block",
        )}
      >
        <div
          className={cn(
            "border-white/10 bg-ink p-[22px] text-text",
            expanded
              ? "max-h-[90vh] overflow-y-auto rounded-t-[18px] border-t shadow-[0_-24px_70px_rgba(0,0,0,.55)]"
              : "lg:rounded-xl lg:border",
          )}
          style={
            expanded
              ? { paddingBottom: "calc(22px + env(safe-area-inset-bottom))" }
              : undefined
          }
        >
          {expanded && (
            <div className="flex justify-center pb-3.5 lg:hidden">
              <button
                type="button"
                aria-label="Collapse"
                className="h-[5px] w-10 rounded-[3px] bg-white/20"
                onClick={() => setExpanded(false)}
              />
            </div>
          )}

          {creatorName && (
            <div className="text-lg font-semibold tracking-tight text-text-strong">
              {creatorName}
            </div>
          )}
          {!published && (
            <p className="mt-2 text-sm text-text-muted">This storefront is not published.</p>
          )}

          <div className="mb-2.5 mt-[22px] text-[11px] font-semibold uppercase tracking-[0.16em] text-text-faint">
            Package
          </div>
          <div role="radiogroup" aria-label="Package" className="flex flex-col gap-2">
            {packages.map((pkg, i) => (
              <button
                key={pkg.id}
                type="button"
                role="radio"
                aria-checked={i === pkgIndex}
                onClick={() => setPkgIndex(i)}
                className="relative block w-full rounded-[10px] border border-white/[0.12] px-3.5 py-3 text-left hover:border-white/30"
              >
                {i === pkgIndex && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-[10px] border-[1.5px] border-beam/85 bg-beam/[0.07]"
                  />
                )}
                <span className="relative flex items-center justify-between gap-2.5">
                  <span className="text-[15px] font-semibold text-text">{pkg.name}</span>
                  <span className="num text-[15px] font-bold text-text-strong">
                    {formatCents(pkg.priceCents)}
                  </span>
                </span>
                <span className="relative mt-1.5 block text-xs text-text-faint">
                  {formatTurnaround(pkg.turnaroundDays)}
                </span>
                {pkg.deliverableSummary && (
                  <span className="relative mt-1.5 block text-[12.5px] leading-snug text-text-muted">
                    {pkg.deliverableSummary}
                  </span>
                )}
              </button>
            ))}
            {packages.length === 0 && (
              <p className="text-sm text-text-muted">No packages yet.</p>
            )}
          </div>

          {rights.length > 0 && (
            <>
              <div className="mb-2.5 mt-[22px] text-[11px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                Usage rights
              </div>
              <div role="radiogroup" aria-label="Usage rights" className="flex flex-col gap-1.5">
                {rights.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={i === rightsIndex}
                    onClick={() => setRightsIndex(i)}
                    className="relative block w-full rounded-[9px] border border-white/[0.12] px-3.5 py-2.5 text-left hover:border-white/30"
                  >
                    {i === rightsIndex && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-[9px] border-[1.5px] border-beam/85 bg-beam/[0.07]"
                      />
                    )}
                    <span className="relative flex items-baseline justify-between gap-2.5">
                      <span className="text-[13.5px] font-semibold text-text">{r.name}</span>
                      <span className="num whitespace-nowrap text-[13px] font-semibold text-beam-soft">
                        {r.priceDeltaCents > 0 ? `+ ${formatCents(r.priceDeltaCents)}` : "Included"}
                      </span>
                    </span>
                    {r.description && (
                      <span className="relative mt-1 block text-xs leading-snug text-text-faint">
                        {r.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedPkg && (
            <>
              <div className="mb-1 mt-5 flex items-baseline justify-between border-t border-white/10 pt-[18px]">
                <span className="text-[13px] text-text-muted">Total</span>
                <span className="num text-[26px] font-bold tracking-tight text-text-strong">
                  {formatCents(total)}
                </span>
              </div>
              <div className="mb-4 text-[11.5px] text-[#6e6353]">{breakdown}</div>
            </>
          )}

          {bookable ? (
            <Link
              href={bookHref}
              className="flex h-[50px] w-full items-center justify-center rounded-[7px] bg-beam text-[15px] font-semibold text-[#17130e] hover:bg-beam-hover hover:shadow-[0_0_26px_rgba(255,178,77,.32)]"
            >
              Request booking
            </Link>
          ) : (
            <p className="rounded-md border border-line px-3 py-2 text-center text-xs text-text-faint">
              {published
                ? "Not bookable yet — usage rights are being set up"
                : "This storefront is not published"}
            </p>
          )}

          <div className="mt-4 flex items-start gap-2">
            <svg
              width="15"
              height="17"
              viewBox="0 0 15 17"
              fill="none"
              aria-hidden
              className="mt-0.5 shrink-0"
            >
              <path
                d="M7.5 1L13 3.2V7.6C13 11.2 10.6 13.9 7.5 15.4C4.4 13.9 2 11.2 2 7.6V3.2L7.5 1Z"
                stroke="#8C806E"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path
                d="M5.2 8L6.9 9.7L10 6.4"
                stroke="#8C806E"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs leading-relaxed text-text-faint">
              Nothing is charged today. Request booking sends an inquiry; payment
              collection is not on yet.
            </span>
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5 border-t border-white/[0.07] pt-3.5">
            <span className="font-display text-[13px] font-semibold tracking-wide text-text-faint">
              Spectacle
            </span>
            <span className="text-[10.5px] uppercase tracking-[0.14em] text-[#5c5346]">
              booking rail
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}