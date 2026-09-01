import type { ReactNode } from "react";

import type { Theme } from "@/db";
import { getTheme } from "@/themes/registry";
import { ThemeProvider } from "@/themes/theme-provider";

/**
 * The themed half of a storefront. Stage tokens exist ONLY inside this
 * subtree ([data-stage]); <BookingRail> is a route-level SIBLING, never a
 * child — its contrast is constant by construction.
 */
export function Stage({ theme, children }: { theme: Theme; children: ReactNode }) {
  const def = getTheme(theme);
  const Signature = def.SignatureComponent;
  return (
    <ThemeProvider
      theme={theme}
      className="relative min-h-[60dvh] overflow-hidden bg-stage-canvas text-stage-text"
    >
      {Signature ? <Signature /> : <StaticStageBackdrop />}
      <div className="relative z-10">{children}</div>
    </ThemeProvider>
  );
}

/** The registered static-gradient reduced-motion variant for stub themes. */
function StaticStageBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, var(--stage-surface) 0%, var(--stage-canvas) 70%)",
      }}
    />
  );
}
