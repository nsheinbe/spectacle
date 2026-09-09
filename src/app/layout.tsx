import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { displayFont, sansFont } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Spectacle", template: "%s · Spectacle" },
  description:
    "Book a creator package from a themed storefront. Proposal, then awaiting payment. Nothing is charged today.",
};

export const viewport: Viewport = {
  themeColor: "#16130f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${sansFont.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
