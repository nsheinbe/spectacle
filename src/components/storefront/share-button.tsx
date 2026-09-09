"use client";

import { useState } from "react";

export function ShareButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
    } catch {
      /* fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className="inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-white/20 px-3.5 text-[13px] font-medium text-[#ddd3c2] hover:border-beam/50 hover:text-beam-wash"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path
          d="M10 4.5C11 4.5 11.8 3.7 11.8 2.7C11.8 1.8 11 1 10 1C9 1 8.2 1.8 8.2 2.7C8.2 2.9 8.2 3 8.3 3.2L5 5.1M5 5.1C4.7 4.8 4.2 4.5 3.7 4.5C2.7 4.5 2 5.3 2 6.3C2 7.2 2.7 8 3.7 8C4.2 8 4.7 7.8 5 7.4M5 5.1C5.2 5.4 5.4 5.8 5.4 6.3C5.4 6.7 5.2 7.1 5 7.4M5 7.4L8.3 9.3C8.2 9.5 8.2 9.6 8.2 9.8C8.2 10.8 9 11.5 10 11.5C11 11.5 11.8 10.8 11.8 9.8C11.8 8.8 11 8 10 8C9.5 8 9 8.3 8.7 8.6"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {copied ? "Copied" : "Share"}
    </button>
  );
}