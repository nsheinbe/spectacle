"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Design projector beam: a radial wash that reveals a display wordmark.
 * Pointer-follow writes --bx/--by. Idle sweep is CSS (no rAF) so
 * verify-themes stays green. Reduced-motion parks the beam mid-frame.
 */
export function BeamSurface({
  wordmark,
  className,
  children,
}: {
  wordmark: string;
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(false);

  const place = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const x = ((clientX - r.left) / r.width) * 100;
    const y = ((clientY - r.top) / r.height) * 100;
    el.style.setProperty("--bx", `${x}%`);
    el.style.setProperty("--by", `${y}%`);
  }, []);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!following) setFollowing(true);
    place(e.clientX, e.clientY);
  };

  return (
    <div
      ref={ref}
      data-hero="1"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setFollowing(false)}
      className={cn("beam-surface relative overflow-hidden", className)}
      data-sweep={following ? "0" : "1"}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[#141109]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg,rgba(255,235,205,.06) 0 2px,transparent 2px 58px),repeating-linear-gradient(0deg,rgba(255,235,205,.05) 0 2px,transparent 2px 78px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-[820px] w-[820px] -ml-[410px] -mt-[410px]"
        style={{
          background:
            "radial-gradient(circle 410px at center,rgba(255,205,140,.5) 0%,rgba(255,183,100,.26) 32%,rgba(255,168,70,.09) 54%,transparent 70%)",
          transform: "translate3d(var(--bx), var(--by), 0)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <span className="select-none font-display text-[clamp(60px,11vw,168px)] font-bold tracking-[0.14em] text-beam-wash/[0.06] pr-[0.14em]">
          {wordmark}
        </span>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        style={{
          WebkitMaskImage:
            "radial-gradient(circle 280px at var(--bx) var(--by),#000 0%,#000 38%,transparent 70%)",
          maskImage:
            "radial-gradient(circle 280px at var(--bx) var(--by),#000 0%,#000 38%,transparent 70%)",
        }}
      >
        <span className="select-none font-display text-[clamp(60px,11vw,168px)] font-bold tracking-[0.14em] text-[#ffe4b5]/[0.92] pr-[0.14em] [text-shadow:0_0_45px_rgba(255,178,77,.4)]">
          {wordmark}
        </span>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg,#16130F 0%,rgba(22,19,15,.92) 26%,rgba(22,19,15,.35) 52%,transparent 72%)",
        }}
      />
      {children}
    </div>
  );
}