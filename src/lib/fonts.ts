import localFont from "next/font/local";

/**
 * Vendored woff2 (OFL — self-hosting permitted); no build-time network.
 * Bodoni Moda is display-only: its optical size axis is effectively pinned
 * by usage — we never set it below 20px (see typography classes), so the
 * <20px opsz hazard never arises.
 */
export const displayFont = localFont({
  src: [
    { path: "../fonts/bodoni-moda-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/bodoni-moda-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

export const sansFont = localFont({
  src: [
    { path: "../fonts/hanken-grotesk-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/hanken-grotesk-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/hanken-grotesk-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});
