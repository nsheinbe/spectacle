import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Stead-shaped language rules for Spectacle (BUILD-PLAN Phase 2).
 *
 * Banned as brand words in src/, README.md, and the self-host / fee-policy
 * docs. Node `crypto` imports for HMAC/UUID stay. Design-system and auth
 * "token" identifiers are not this scan — those are not brand copy.
 */

const ROOT = path.resolve(__dirname, "..");

const DOC_TARGETS = ["README.md", "SELF-HOST.md", "FEE-POLICY.md"] as const;

const BRAND_NEEDLES: Array<{ id: string; re: RegExp }> = [
  { id: "blockchain", re: /\bblockchain\b/i },
  { id: "web3", re: /\bweb3\b/i },
  { id: "wallet", re: /\bwallets?\b/i },
  { id: "dao", re: /\bDAO\b/ },
  { id: "smart-contract", re: /\bsmart\s+contracts?\b/i },
  { id: "on-chain", re: /\bon-chain\b/i },
  { id: "onchain", re: /\bonchain\b/i },
  { id: "escrow", re: /\bescrow\b/i },
  { id: "solana", re: /\bsolana\b/i },
];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|jsx|md|css)$/.test(name)) out.push(full);
  }
  return out;
}

function stripAllowedCryptoImports(text: string): string {
  return text
    .replace(/from\s+["']node:crypto["']/g, "from ALLOWED_NODE_CRYPTO")
    .replace(/import\s*\(\s*["']node:crypto["']\s*\)/g, "import(ALLOWED_NODE_CRYPTO)")
    .replace(/require\s*\(\s*["']node:crypto["']\s*\)/g, "require(ALLOWED_NODE_CRYPTO)");
}

function lineHits(text: string, re: RegExp): number[] {
  const lines: number[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (re.test(line)) lines.push(i + 1);
  });
  return lines;
}

export function languageRuleViolations(): string[] {
  const files = [
    ...DOC_TARGETS.map((f) => path.join(ROOT, f)),
    ...walk(path.join(ROOT, "src")),
  ];
  const violations: string[] = [];
  for (const file of files) {
    if (!existsSync(file)) {
      violations.push(`missing ${path.relative(ROOT, file)}`);
      continue;
    }
    const raw = readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const text = stripAllowedCryptoImports(raw);
    for (const { id, re } of BRAND_NEEDLES) {
      const hits = lineHits(text, re);
      for (const n of hits) violations.push(`${rel}:${n}: banned brand word "${id}"`);
    }
    const cryptoHits = lineHits(text, /\bcrypto\b/i);
    for (const n of cryptoHits) {
      violations.push(`${rel}:${n}: banned brand word "crypto" (node:crypto imports are allowed)`);
    }
  }
  return violations;
}

export function envContractViolations(): string[] {
  const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  const violations: string[] = [];
  if (/NEXT_PUBLIC_/.test(example)) {
    violations.push(".env.example: NEXT_PUBLIC_ keys are not part of the contract");
  }
  const urlKeys = [...example.matchAll(/^([A-Z0-9_]*DATABASE[A-Z0-9_]*)=/gm)].map((m) => m[1]);
  const expected = ["DATABASE_URL", "DATABASE_URL_OWNER", "AUTH_DATABASE_URL"];
  if (urlKeys.join(",") !== expected.join(",")) {
    violations.push(
      `.env.example: expected exactly ${expected.join(", ")}; found ${urlKeys.join(", ") || "(none)"}`,
    );
  }
  if (/POSTGRES_ADMIN_URL=/.test(example)) {
    violations.push(".env.example: POSTGRES_ADMIN_URL is bootstrap-only, not a fourth app URL");
  }
  return violations;
}
