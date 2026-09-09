import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Fill unset process.env keys from a local `.env` file. Existing values win
 * so CI, hosted deploys, and an already-exported shell are never overridden.
 * Used by migrate / seed / self-host bootstrap so a reader of SELF-HOST.md
 * can keep secrets in `.env` (gitignored) without a fourth connection string
 * and without a dotenv dependency.
 */
export function loadLocalEnv(file = path.resolve(".env")): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined && process.env[key] !== "") continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
