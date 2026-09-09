import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { envContractViolations, languageRuleViolations } from "../scripts/language-rules";
import { SEED_BRAND_EMAIL, SEED_DEMO_PASSWORD, SEED_STOREFRONT_SLUG } from "../scripts/seed";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 2 — open rails, self-host, fee policy", () => {
  it("language rules are clean in src/, README, and new docs", () => {
    expect(languageRuleViolations()).toEqual([]);
  });

  it("env contract stays three URLs and no NEXT_PUBLIC_ keys", () => {
    expect(envContractViolations()).toEqual([]);
  });

  it("fee policy states framing, live bps, who pays, and app_user cannot write", () => {
    const policy = read("FEE-POLICY.md");
    expect(policy).toMatch(/~18% cut/);
    expect(policy).toMatch(/keep more/);
    expect(policy).toMatch(/platform_config\.fee_bps/);
    expect(policy).toMatch(/\b1000\b/);
    expect(policy).toMatch(/10%/);
    expect(policy).toMatch(/database is authoritative/i);
    expect(policy).toMatch(/PLATFORM_FEE_BPS/);
    expect(policy).toMatch(/app_user[\s`]+cannot write[\s`]+platform_config/);
    expect(policy).toMatch(/purchaser \(brand\)/);
    expect(policy).toMatch(/REVOKE ALL/);
    expect(policy).not.toMatch(/competitor \w+ takes/i);
  });

  it("self-host doc names the exact commands in this repo", () => {
    const doc = read("SELF-HOST.md");
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    for (const script of [
      "self-host:init-env",
      "self-host:bootstrap",
      "migrate",
      "seed",
      "build",
      "start",
      "verify:self-host",
    ]) {
      expect(pkg.scripts[script], script).toBeTruthy();
      expect(doc).toContain(`pnpm ${script}`);
    }
    expect(doc).toContain("docker compose up -d db");
    expect(doc).toContain("docker compose --profile app up --build");
    expect(doc).toContain("/api/health");
    expect(doc).toContain(SEED_BRAND_EMAIL);
    expect(doc).toContain(SEED_DEMO_PASSWORD);
    expect(doc).toContain(`/c/${SEED_STOREFRONT_SLUG}`);
    expect(doc).toContain("No Vercel. No Neon.");
  });

  it("README links the self-host path and fee policy", () => {
    const readme = read("README.md");
    expect(readme).toContain("SELF-HOST.md");
    expect(readme).toContain("FEE-POLICY.md");
  });

  it("default fee_bps stays 1000", () => {
    expect(read("drizzle/0000_schema.sql")).toMatch(/"fee_bps" integer DEFAULT 1000 NOT NULL/);
    expect(read("drizzle/0003_functions.sql")).toMatch(
      /INSERT INTO "platform_config" \(id, fee_bps\) VALUES \(1, 1000\)/,
    );
    expect(read("src/db/schema.ts")).toMatch(/feeBps: integer\("fee_bps"\)\.notNull\(\)\.default\(1000\)/);
  });

  it("CI runs the recorded self-host path", () => {
    expect(read(".github/workflows/ci.yml")).toContain("pnpm verify:self-host");
  });
});
