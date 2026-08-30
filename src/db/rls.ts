import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { need } from "@/lib/env";
import { getAppPool } from "./client.internal";
import * as schema from "./schema";
import type { UserRole } from "./schema";

/**
 * The RLS boundary. Application code reaches the database ONLY through
 * withUser(), which runs `fn` inside a single transaction on a single
 * checked-out `app_user` connection with the identity GUCs set
 * transaction-locally:
 *
 *   select set_config('app.user_id', $1, true), set_config('app.user_role', $2, true)
 *
 * Anonymous callers set NOTHING. On a pooled connection a previously-set
 * transaction-local GUC reverts to the EMPTY STRING (not NULL) after
 * commit, so all SQL-side reads go through app_uid()/app_role(), which
 * NULLIF-normalize '' → NULL (see migration 0002_rls). Never read the
 * GUCs with a bare current_setting() in SQL.
 *
 * Postgres enforcement stack under this: app_user has no BYPASSRLS, no
 * SUPERUSER, is not the table owner; grants are column allowlists;
 * policies are default-deny per command. verify-gates.ts proves all of
 * it adversarially — including that this suite itself runs as app_user.
 */

export type SessionIdentity = {
  userId: string;
  role: UserRole;
};

export type Db = NodePgDatabase<typeof schema>;

export async function withUser<T>(
  session: SessionIdentity | null,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const client = await getAppPool().connect();
  try {
    await client.query("BEGIN");
    if (session) {
      await client.query(
        "select set_config('app.user_id', $1, true), set_config('app.user_role', $2, true)",
        [session.userId, session.role],
      );
    }
    const tx = drizzle(client, { schema });
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection-level failure; release() below returns it for destruction */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * OWNER connection (spectacle_owner) — bypasses RLS as table owner.
 * Reachable ONLY from scripts/ (migrate, seed, verify) and, in Phase 2,
 * the allowlisted Stripe webhook handler. The ESLint module ban plus the
 * verify-gates fs scan keep this out of all other application code.
 */
let ownerPool: Pool | null = null;
let ownerDb: Db | null = null;

export function systemDb(): Db {
  if (!ownerDb) {
    ownerPool = new Pool({
      connectionString: need("DATABASE_URL_OWNER"),
      max: 3,
    });
    ownerDb = drizzle(ownerPool, { schema });
  }
  return ownerDb;
}

export async function _closeSystemPool(): Promise<void> {
  if (ownerPool) {
    await ownerPool.end();
    ownerPool = null;
    ownerDb = null;
  }
}
