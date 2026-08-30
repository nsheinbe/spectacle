"use client";

import { useEffect, useRef, useState } from "react";

import type { SignatureProps } from "./types";

/**
 * Projection theme signature: a slow light-beam sweep across a night facade.
 * THE one rAF/canvas loop this theme is allowed (<=1 per page, enforced by
 * verify-themes). Paused whenever offscreen via IntersectionObserver, and
 * fully static under prefers-reduced-motion (or when reducedMotion is
 * forced): a single frame is painted, no loop ever starts.
 */
export function ProjectionSignature({ reducedMotion }: SignatureProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isStatic = reducedMotion || systemReduced;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
    };
    resize();

    const paint = (t: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      // night gradient ground
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "rgba(10, 7, 20, 0)");
      sky.addColorStop(1, "rgba(22, 16, 40, 0.9)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // the beam
      const x = w * (0.5 + 0.42 * Math.sin(t));
      const beam = ctx.createLinearGradient(x - w * 0.18, 0, x + w * 0.18, 0);
      beam.addColorStop(0, "rgba(255, 178, 77, 0)");
      beam.addColorStop(0.5, "rgba(255, 178, 77, 0.22)");
      beam.addColorStop(1, "rgba(255, 178, 77, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.02, h);
      ctx.lineTo(x - w * 0.2, 0);
      ctx.lineTo(x + w * 0.2, 0);
      ctx.lineTo(x + w * 0.02, h);
      ctx.closePath();
      ctx.fill();
      // hot core
      ctx.fillStyle = "rgba(255, 178, 77, 0.5)";
      ctx.fillRect(x - 1 * dpr, 0, 2 * dpr, h);
    };

    if (isStatic) {
      paint(0.8); // one composed frame, beam resting off-center
      return;
    }

    let raf = 0;
    let visible = true;
    let running = false;
    const loop = (now: number) => {
      if (!visible) {
        running = false;
        return;
      }
      paint(now / 6000);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) start();
    });
    io.observe(canvas);
    window.addEventListener("resize", resize);
    start();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [isStatic]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
