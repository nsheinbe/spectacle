"use client";

import Link from "next/link";
import { useState } from "react";

import { LAUNCH_COPY } from "@/lib/launch-copy";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#storefronts", label: "Storefronts" },
  { href: "#formats", label: "Formats" },
  { href: "#creators", label: "For creators" },
] as const;

export function HomeNav({
  signedIn,
  primaryHref,
  showBrowse = false,
}: {
  signedIn: boolean;
  primaryHref: string;
  showBrowse?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-[80] flex h-[74px] items-center justify-between border-b border-line bg-[rgba(19,16,12,.94)] px-8 backdrop-blur">
        <div className="flex items-center gap-10">
          <span className="font-display text-[23px] font-semibold tracking-[0.01em] text-text-strong">
            {LAUNCH_COPY.productName}
          </span>
          <div className="hidden items-center gap-[26px] text-sm font-medium text-text-muted md:flex">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-text-muted hover:text-text">
                {l.label}
              </a>
            ))}
            {showBrowse && (
              <Link href="/browse" className="text-text-muted hover:text-text">
                {LAUNCH_COPY.browseCta}
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-[18px]">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="hidden text-sm font-medium text-[#ddd3c2] md:inline hover:text-text"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/auth"
              className="hidden text-sm font-medium text-[#ddd3c2] md:inline hover:text-text"
            >
              Log in
            </Link>
          )}
          <Link
            href={primaryHref}
            className="inline-flex h-10 items-center rounded-[5px] bg-beam px-[18px] text-sm font-semibold text-[#17130e] hover:bg-beam-hover hover:shadow-[0_0_24px_rgba(255,178,77,.35)]"
          >
            {LAUNCH_COPY.brandCta.label}
          </Link>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[5px] border border-white/20 text-[#ede4d5] md:hidden"
            onClick={() => setOpen(true)}
          >
            <svg width="18" height="12" viewBox="0 0 18 12" fill="none" aria-hidden>
              <path d="M0 1H18M0 6H18M0 11H18" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-[rgba(16,13,9,.98)] px-8 py-6 md:hidden">
          <div className="-mx-8 -mt-6 mb-[22px] flex h-[74px] items-center justify-between border-b border-line px-8">
            <span className="font-display text-[23px] font-semibold text-text-strong">
              {LAUNCH_COPY.productName}
            </span>
            <button
              type="button"
              aria-label="Close menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[5px] border border-white/20 text-[#ede4d5]"
              onClick={() => setOpen(false)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-2.5 font-display text-[30px] font-medium text-text"
              >
                {l.label}
              </a>
            ))}
            {showBrowse && (
              <Link
                href="/browse"
                onClick={() => setOpen(false)}
                className="py-2.5 font-display text-[30px] font-medium text-text"
              >
                {LAUNCH_COPY.browseCta}
              </Link>
            )}
            <Link
              href={signedIn ? "/dashboard" : "/auth"}
              onClick={() => setOpen(false)}
              className="pt-4 text-base font-medium text-text-muted"
            >
              {signedIn ? "Dashboard" : "Log in"}
            </Link>
          </div>
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <Link
              href={primaryHref}
              onClick={() => setOpen(false)}
              className="flex h-[52px] items-center justify-center rounded-md bg-beam text-base font-semibold text-[#17130e]"
            >
              {LAUNCH_COPY.brandCta.label}
            </Link>
            <Link
              href="/auth"
              onClick={() => setOpen(false)}
              className="flex h-[52px] items-center justify-center rounded-md border border-white/20 text-base font-semibold text-[#ede4d5]"
            >
              {LAUNCH_COPY.creatorCta.label}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}