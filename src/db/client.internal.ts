import { Pool } from "pg";

import { need } from "../lib/env";

/**
 * PRIVATE MODULE — do not import outside src/db/**.
 * The tenant-traffic pool, connecting as `app_user` (subject to RLS, no
 * BYPASSRLS/SUPERUSER). Application code never touches this directly:
 * every query goes through withUser() in rls.ts, which owns the
 * transaction + set_config lifecycle on a single checked-out client.
 * Lazy so `next build` succeeds without a database.
 */
let pool: Pool | null = null;

export function getAppPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: need("DATABASE_URL"),
      max: 10,
    });
  }
  return pool;
}

/** Test hook: close and forget the pool (verify-gates spins up throwaway DBs). */
export async function _closeAppPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
