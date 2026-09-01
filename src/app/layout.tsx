import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { displayFont, sansFont } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Spectacle", template: "%s · Spectacle" },
  description:
    "Book spectacle advertising — projection mapping, FOOH, anamorphic, drone shows, street art — from the creators who make it.",
};

export const viewport: Viewport = {
  themeColor: "#14100b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${sansFont.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
