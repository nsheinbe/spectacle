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

/**
 * Fail-closed identity check for the tenant pool.
 *
 * Every tenant guarantee in this codebase — RLS policies, column allowlists,
 * the SECURITY DEFINER status boundary — is enforced by Postgres against the
 * role in DATABASE_URL. Point DATABASE_URL at a privileged role and none of it
 * applies: no error is raised, no policy is violated, queries simply return
 * every tenant's rows. It is the one misconfiguration that fails silently and
 * looks like a working deployment.
 *
 * It is also the easy mistake to make. A Neon project hands you exactly one
 * connection string, for a default role that is a member of neon_superuser and
 * does have BYPASSRLS; pasting it into DATABASE_URL is the obvious move and
 * silently disables the entire security model. So the app refuses to serve a
 * single tenant query until it has confirmed otherwise.
 *
 * Three ways to bypass RLS, three checks: the BYPASSRLS attribute, SUPERUSER
 * (which implies it), and table ownership (an owner bypasses its own tables
 * under plain ENABLE — the very mechanism spectacle_owner relies on).
 */
export async function checkUnprivileged(p: Pool): Promise<void> {
  const { rows } = await p.query(
    `select r.rolname as role,
            r.rolsuper,
            r.rolbypassrls,
            (select count(*)::int from pg_tables
              where schemaname = 'public' and tableowner = current_user) as owned
       from pg_roles r
      where r.rolname = current_user`,
  );
  if (rows.length !== 1) {
    throw new Error(
      `Refusing to serve tenant traffic: could not resolve the current role from pg_roles.`,
    );
  }
  const { role, rolsuper, rolbypassrls, owned } = rows[0] as {
    role: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    owned: number;
  };
  const reasons: string[] = [];
  if (rolsuper) reasons.push("is SUPERUSER");
  if (rolbypassrls) reasons.push("has BYPASSRLS");
  if (owned > 0) reasons.push(`owns ${owned} table(s) in schema public`);
  if (reasons.length) {
    throw new Error(
      `Refusing to serve tenant traffic: DATABASE_URL connects as "${role}", which ` +
        `${reasons.join(" and ")} — row-level security would not apply. DATABASE_URL ` +
        `must be the app_user connection string; the owner connection belongs in ` +
        `DATABASE_URL_OWNER. See .env.example and scripts/neon-bootstrap.ts.`,
    );
  }
}

/**
 * Memoized to one round trip per process: on success every later call reuses
 * the resolved promise; on failure the memo is cleared so a transient
 * connection error is retried rather than cached as a permanent outage.
 */
let identityChecked: Promise<void> | null = null;

export function assertAppPoolIsUnprivileged(): Promise<void> {
  if (!identityChecked) {
    identityChecked = checkUnprivileged(getAppPool()).catch((err) => {
      identityChecked = null;
      throw err;
    });
  }
  return identityChecked;
}

/** Test hook: close and forget the pool (verify-gates spins up throwaway DBs). */
export async function _closeAppPool(): Promise<void> {
  identityChecked = null;
  if (pool) {
    await pool.end();
    pool = null;
  }
}
