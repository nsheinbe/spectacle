import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { env } from "../src/lib/env";
import { LAUNCH_COPY } from "../src/lib/launch-copy";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 1 Design import — honesty + flags", () => {
  it("FEATURE_BROWSE stays false", () => {
    expect(env.FEATURE_BROWSE).toBe(false);
    const browse = read("src/app/browse/page.tsx");
    expect(browse).toContain("notFound()");
    expect(browse).toMatch(/no UI in Phase 1 even when flagged on/);
  });

  it("/ is the Home artboard, not a dashboard redirect", () => {
    const home = read("src/app/page.tsx");
    expect(home).not.toMatch(/redirect\s*\(\s*["']\/dashboard["']\s*\)/);
    expect(home).toContain("LAUNCH_COPY");
    expect(home).toContain("HomeNav");
  });

  it("LAUNCH_COPY has no invented GMV, ratings, or $12.4M", () => {
    expect(read("src/lib/launch-copy.ts")).not.toMatch(/\$12\.4M|12\.4M/);
    const publicText = Object.values(LAUNCH_COPY)
      .flatMap((v) =>
        typeof v === "string"
          ? [v]
          : Array.isArray(v)
            ? v.map((item) =>
                typeof item === "string" ? item : Object.values(item).join(" "),
              )
            : typeof v === "object"
              ? Object.values(v).map(String)
              : [],
      )
      .join("\n");
    expect(publicText).not.toMatch(/\$12\.4M|12\.4M/);
    expect(publicText).not.toMatch(/4\.9|2\.4M|5\.1M/);
    expect(LAUNCH_COPY.subhead).toMatch(/Nothing is charged today/);
    expect(LAUNCH_COPY.featuredEmpty).toMatch(/no directory/i);
  });

  it("application source never uses the word escrow", () => {
    const files = [
      "src/lib/launch-copy.ts",
      "src/app/page.tsx",
      "src/components/rail/booking-rail.tsx",
      "src/app/c/[slug]/page.tsx",
      "src/components/home/home-nav.tsx",
    ];
    for (const f of files) {
      expect(read(f), f).not.toMatch(/escrow/i);
    }
  });

  it("home and rail do not link to /browse", () => {
    expect(read("src/app/page.tsx")).not.toContain('href="/browse"');
    expect(read("src/components/home/home-nav.tsx")).not.toContain('href="/browse"');
    expect(read("src/app/c/[slug]/page.tsx")).not.toContain('href="/browse"');
  });

  it("rail stays unthemed chrome", () => {
    const rail = read("src/components/rail/booking-rail.tsx");
    expect(rail).not.toMatch(/from\s+["']@\/themes/);
    expect(rail).toContain("bg-ink");
    expect(rail).toContain("Request booking");
  });
});
