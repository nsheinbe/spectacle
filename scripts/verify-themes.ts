import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { themeRegistry } from "../src/themes/registry";

/**
 * verify-themes — per registered theme: WCAG AA stage contrast over the
 * token maps, a registered reduced-motion variant, at most ONE rAF/canvas
 * loop (paused offscreen), and the structural stage/rail boundary. Rail
 * contrast is asserted ONCE globally (the rail's background is a constant,
 * never themed). Non-zero exit on any failure.
 */

const ROOT = path.resolve(__dirname, "..");
let failures = 0;

function fail(msg: string): void {
  console.log(`  ✗ ${msg}`);
  failures++;
}

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

/* ── WCAG relative luminance / contrast ── */

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`bad hex: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function assertContrast(
  label: string,
  fg: string,
  bg: string,
  min: number,
): void {
  const c = contrast(fg, bg);
  if (c >= min) ok(`${label}: ${c.toFixed(2)} (>= ${min})`);
  else fail(`${label}: ${c.toFixed(2)} < ${min}`);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

/* ── per-theme checks ── */

console.log("verify-themes\n");

const signatureFiles = new Set<string>();

for (const def of Object.values(themeRegistry)) {
  console.log(`theme: ${def.name}${def.stub ? " (base-dark stub)" : ""}`);
  const t = def.stageTokens;
  // AA normal text (>=4.5) on BOTH stage backgrounds
  assertContrast("text vs canvas", t.text, t.canvas, 4.5);
  assertContrast("text vs surface", t.text, t.surface, 4.5);
  assertContrast("textMuted vs canvas", t.textMuted, t.canvas, 4.5);
  assertContrast("textMuted vs surface", t.textMuted, t.surface, 4.5);
  // large-text-only role (>=18px / >=24px or >=18.66px bold): 3.0
  assertContrast("textFaint (large-only) vs canvas", t.textFaint, t.canvas, 3.0);
  // accent as UI component color: 3.0
  assertContrast("accent vs canvas", t.accent, t.canvas, 3.0);

  if (!def.reducedMotionVariant) fail("no reduced-motion variant registered");
  else ok(`reduced-motion variant: ${def.reducedMotionVariant}`);

  if (def.hasRafLoop) {
    if (!def.signatureFile) {
      fail("hasRafLoop without signatureFile");
    } else {
      const p = path.join(ROOT, def.signatureFile);
      signatureFiles.add(path.normalize(p));
      if (!existsSync(p)) fail(`signature file missing: ${def.signatureFile}`);
      else {
        const text = readFileSync(p, "utf8");
        if (!text.includes("requestAnimationFrame")) fail("declared rAF loop not found");
        else ok("single rAF loop present");
        if (!text.includes("IntersectionObserver")) fail("rAF loop not IntersectionObserver-paused");
        else ok("IntersectionObserver-paused");
        if (!text.includes("prefers-reduced-motion")) fail("no prefers-reduced-motion handling");
        else ok("prefers-reduced-motion handled");
      }
    }
  } else if (def.SignatureComponent) {
    fail("SignatureComponent on a theme declaring no rAF loop — audit it");
  } else {
    ok("no rAF loop (static stub)");
  }
  console.log("");
}

/* ── no undeclared rAF loops anywhere in src/themes or src/components ── */

for (const file of [...walk(path.join(ROOT, "src/themes")), ...walk(path.join(ROOT, "src/components"))]) {
  if (signatureFiles.has(path.normalize(file))) continue;
  if (readFileSync(file, "utf8").includes("requestAnimationFrame")) {
    fail(`undeclared rAF loop in ${path.relative(ROOT, file)}`);
  }
}
ok("no undeclared rAF loops outside registered signature files");

/* ── stage/rail structural boundary ── */

const railDir = path.join(ROOT, "src/components/rail");
for (const file of walk(railDir)) {
  const text = readFileSync(file, "utf8");
  if (/from\s+["'][^"']*themes/.test(text)) {
    fail(`${path.relative(ROOT, file)} imports src/themes/** — rail must never theme`);
  }
}
ok("rail imports no theme modules");

/* ── rail contrast, once, globally (constant #1C1710 background) ── */

console.log("\nrail (platform chrome, constant):");
const tokensCss = readFileSync(path.join(ROOT, "src/styles/tokens.css"), "utf8");
function cssToken(name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokensCss);
  if (!m) throw new Error(`token ${name} not found in tokens.css`);
  return m[1]!;
}
const ink = cssToken("--color-ink");
assertContrast("chrome text vs rail", cssToken("--color-text"), ink, 4.5);
assertContrast("chrome muted vs rail", cssToken("--color-text-muted"), ink, 4.5);
assertContrast("chrome faint (large-only) vs rail", cssToken("--color-text-faint"), ink, 3.0);
assertContrast("beam accent vs rail", cssToken("--color-beam"), ink, 3.0);

if (failures > 0) {
  console.error(`\nverify-themes: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\nverify-themes: GREEN");
