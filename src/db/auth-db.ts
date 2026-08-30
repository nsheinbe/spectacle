import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { need } from "@/lib/env";
import * as schema from "./schema";

/**
 * PRIVATE MODULE — only src/lib/auth/** may import this.
 * Better Auth's database handle, connecting as `auth_user`: grants on
 * user/session/account/verification ONLY, zero grants on every domain
 * table. Better Auth never runs as the owner.
 */
let pool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

export function _authDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    pool = new Pool({
      connectionString: need("AUTH_DATABASE_URL"),
      max: 5,
    });
    db = drizzle(pool, { schema });
  }
  return db;
}

export async function _closeAuthPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
