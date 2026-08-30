import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * The ONLY way migrations are applied — everywhere. with-throwaway-db.ts, CI,
 * and Neon all run this same journaled chain (drizzle/meta/_journal.json) as
 * spectacle_owner. `drizzle-kit push` / `drizzle-kit migrate` are forbidden
 * (README decision log; verify-gates greps for them).
 *
 * Roles must already exist: scripts/bootstrap-roles.sql runs first, as a
 * privileged role — never as spectacle_owner (which this script connects as).
 */
export async function applyMigrations(ownerUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) {
    console.error("DATABASE_URL_OWNER is required (see .env.example)");
    process.exit(1);
  }
  applyMigrations(url)
    .then(() => console.log("migrations applied"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
