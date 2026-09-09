"use client";

import { useEffect, useRef } from "react";

const SURFACES = [
  "repeating-linear-gradient(178deg,#1b1c22 0 26px,#14151a 26px 30px)",
  "linear-gradient(150deg,#221a12,#14100a)",
  "repeating-linear-gradient(180deg,#1d1811 0 22px,#16110b 22px 25px)",
  "repeating-linear-gradient(90deg,#1e1a15 0 40px,#181410 40px 42px)",
  "radial-gradient(120% 80% at 50% 20%,#241d13,#120e08)",
  "repeating-linear-gradient(180deg,#1c1710 0 34px,rgba(0,0,0,.4) 34px 36px,#1c1710 36px 70px)",
] as const;

export function PortfolioTile({
  title,
  location,
  index,
}: {
  title: string;
  location?: string | null;
  index: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const word = title.split(/[\s—–-]+/).filter(Boolean)[0] ?? title;
  const surface = SURFACES[index % SURFACES.length];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lit = () => {
      if (el.dataset.lit) return;
      el.dataset.lit = "1";
      if (reduce) {
        el.style.opacity = "1";
        return;
      }
      const d = (index % 2) * 120 + Math.floor(index / 2) * 90;
      window.setTimeout(() => el.classList.add("animate-flicker-on"), d);
    };
    if (!("IntersectionObserver" in window) || reduce) {
      el.style.opacity = "1";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            lit();
            io.unobserve(en.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.2 },
    );
    io.observe(el);
    const failsafe = window.setTimeout(lit, 2600);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [index]);

  return (
    <figure
      ref={ref}
      data-tile="1"
      style={{ opacity: 0 }}
      className="relative m-0 aspect-video overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0f0c08] transition-transform duration-300 hover:-translate-y-[3px]"
    >
      <div aria-hidden className="absolute inset-0" style={{ background: surface }} />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 flex h-2/3 items-center justify-center px-4 [transform:perspective(900px)_rotateY(-6deg)_scale(.9)]"
      >
        <span className="font-display text-[clamp(20px,4vw,34px)] font-bold tracking-[0.03em] text-[#ffeccd]/90 [text-shadow:0_0_26px_rgba(255,178,77,.5)]">
          {word.toUpperCase()}
        </span>
      </div>
      <div
        aria-hidden
        className="animate-scan absolute inset-x-0 h-[38%]"
        style={{
          background:
            "linear-gradient(180deg,transparent,rgba(255,228,181,.12),transparent)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top,rgba(9,7,4,.92) 0%,rgba(9,7,4,.35) 34%,transparent 58%)",
        }}
      />
      <figcaption className="absolute inset-x-0 bottom-0 px-[15px] py-3.5">
        <div className="text-sm font-semibold tracking-tight text-stage-text">
          {title || "Untitled"}
        </div>
        {location && (
          <div className="mt-0.5 text-xs text-stage-text-faint">{location}</div>
        )}
      </figcaption>
    </figure>
  );
}