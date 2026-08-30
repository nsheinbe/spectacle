import { defineConfig } from "drizzle-kit";

// Migrations are generated here (`drizzle-kit generate` / `generate --custom`)
// and applied ONLY by scripts/migrate.ts (drizzle-orm migrate() as spectacle_owner).
// `drizzle-kit push` and `drizzle-kit migrate` are forbidden — see README decision log.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
