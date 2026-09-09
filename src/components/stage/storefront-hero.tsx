"use client";

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

import { LAUNCH_COPY } from "@/lib/launch-copy";
import { cn } from "@/lib/utils";

/**
 * Creator-storefront 16:9 projected surface (Theme Contract: projection).
 * Beam follow is pointer + CSS custom properties — no rAF.
 */
export function StorefrontHero({
  wordmark,
  theme,
}: {
  wordmark: string;
  theme: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(false);
  const isProjection = theme === "projection";

  const place = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    el.style.setProperty("--bx", `${((clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--by", `${((clientY - r.top) / r.height) * 100}%`);
  }, []);

  return (
    <div
      ref={ref}
      data-hero="1"
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
        if (!isProjection) return;
        if (!following) setFollowing(true);
        place(e.clientX, e.clientY);
      }}
      onPointerLeave={() => setFollowing(false)}
      className={cn(
        "beam-surface relative aspect-video overflow-hidden rounded-xl border border-white/[0.08] bg-stage-surface",
        isProjection && "beam-surface",
      )}
      data-sweep={isProjection && !following ? "1" : "0"}
      style={{ "--bx": "40%", "--by": "52%" } as CSSProperties}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: isProjection
            ? "repeating-linear-gradient(180deg,#171208 0 30px,#120E07 30px 33px)"
            : "radial-gradient(120% 80% at 50% 0%, var(--stage-surface) 0%, var(--stage-canvas) 70%)",
        }}
      />
      {isProjection && (
        <>
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              WebkitMaskImage:
                "radial-gradient(circle 34% at var(--bx) var(--by),#000 0%,#000 46%,transparent 76%)",
              maskImage:
                "radial-gradient(circle 34% at var(--bx) var(--by),#000 0%,#000 46%,transparent 76%)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg,rgba(255,214,160,.32) 0 1px,transparent 1px 30px),repeating-linear-gradient(0deg,rgba(255,214,160,.28) 0 1px,transparent 1px 30px)",
              }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center [transform:perspective(1200px)_rotateX(4deg)_rotateY(-7deg)_scale(.98)]">
              <div className="font-display text-[clamp(40px,9vw,120px)] font-bold leading-none tracking-[0.02em] text-[#ffeecc]/[0.95] [text-shadow:0_0_44px_rgba(255,178,77,.5)]">
                {wordmark}
              </div>
            </div>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 h-[120%] w-[70%] -ml-[35%] -mt-[10%]"
            style={{
              background:
                "radial-gradient(circle at center,rgba(255,222,168,.42) 0%,rgba(255,196,120,.16) 40%,transparent 66%)",
              transform: "translate3d(var(--bx), var(--by), 0)",
            }}
          />
        </>
      )}
      {!isProjection && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-[clamp(40px,8vw,88px)] font-bold tracking-[0.04em] text-stage-text/20">
            {wordmark}
          </span>
        </div>
      )}
      <div className="absolute left-4 top-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stage-text-muted">
        <span className="animate-live h-1.5 w-1.5 rounded-full bg-stage-accent" />
        Showreel
      </div>
      <div className="absolute bottom-4 left-4 text-[11px] tracking-wide text-stage-text-faint">
        <span className="hidden [@media(pointer:fine)]:inline">{LAUNCH_COPY.beamHintFine}</span>
        <span className="[@media(pointer:fine)]:hidden">{LAUNCH_COPY.beamHintCoarse}</span>
      </div>
    </div>
  );
}