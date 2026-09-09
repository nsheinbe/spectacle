"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { LAUNCH_COPY } from "@/lib/launch-copy";
import { formatCents } from "@/lib/utils";

export type HomeCreatorCardProps = {
  slug: string;
  name: string;
  format: string;
  fromCents: number | null;
  index: number;
};

/** Design featured card: dark until lit, then CSS flicker. No ratings, no reach. */
export function HomeCreatorCard({
  slug,
  name,
  format,
  fromCents,
  index,
}: HomeCreatorCardProps) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveal = () => {
      if (el.dataset.lit) return;
      el.dataset.lit = "1";
      if (reduce) {
        el.style.opacity = "1";
        return;
      }
      window.setTimeout(() => el.classList.add("animate-flicker-on"), index * 140);
    };
    if (!("IntersectionObserver" in window) || reduce) {
      el.style.opacity = "1";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            reveal();
            io.unobserve(en.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.2 },
    );
    io.observe(el);
    const failsafe = window.setTimeout(reveal, 2600);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [index]);

  return (
    <Link
      ref={ref}
      href={`/c/${slug}`}
      data-flicker="1"
      style={{ opacity: 0 }}
      className="group relative block rounded-lg transition-transform duration-200 hover:-translate-y-1"
      aria-label={
        fromCents !== null
          ? `${name} — ${format}, from ${formatCents(fromCents)}`
          : `${name} — ${format}`
      }
    >
      <div
        aria-hidden
        className="absolute -inset-3.5 z-0 rounded-2xl opacity-90 blur-[14px] transition-[filter] group-hover:brightness-125"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 46%,rgba(255,178,77,.22),transparent 72%)",
        }}
      />
      <div className="relative z-[1] aspect-card overflow-hidden rounded-lg border border-white/10 bg-[#0f0c08]">
        <div aria-hidden className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(65% 55% at 42% 40%,rgba(255,201,140,.4),transparent 66%),linear-gradient(160deg,#241a10,#0d0a06)",
            }}
          />
          <div
            data-reel="1"
            className="animate-reel absolute -inset-[20%]"
            style={{
              background:
                "radial-gradient(45% 45% at 50% 42%,rgba(255,222,176,.5),transparent 65%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-50"
            style={{
              background:
                "repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 4px)",
            }}
          />
          <div
            className="animate-scan absolute left-0 right-0 h-2/5"
            style={{
              background:
                "linear-gradient(180deg,transparent,rgba(255,228,181,.14),transparent)",
            }}
          />
        </div>
        <div className="absolute left-3.5 top-3.5 rounded-full bg-[rgba(15,12,8,.85)] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-text">
          {format}
        </div>
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top,rgba(11,9,6,.92) 0%,rgba(11,9,6,.5) 26%,transparent 52%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-[17px] font-semibold tracking-tight text-text-strong">
            {name}
          </div>
          {fromCents !== null && (
            <div className="mt-2 text-[13px] text-[#c6b9a4]">
              {LAUNCH_COPY.featuredFrom}{" "}
              <span className="num font-semibold text-beam-soft">
                {formatCents(fromCents)}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}