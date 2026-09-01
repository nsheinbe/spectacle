import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Pool } from "pg";

/**
 * One-time Neon provisioning: the hosted counterpart of what
 * with-throwaway-db.ts does locally with an initdb superuser.
 *
 * Neon has no superuser, but the project's default role (`neondb_owner`) is a
 * member of `neon_superuser` and therefore holds CREATEROLE — enough for every
 * statement in bootstrap-roles.sql. Roles created this way inherit nothing:
 * they are not members of neon_superuser and get rolbypassrls = false, which
 * is exactly the shape verify-gates asserts and the shape the RLS design needs.
 *
 * Run with the Neon admin (default-role) connection string:
 *
 *   NEON_ADMIN_URL='postgresql://neondb_owner:…@ep-…-pooler.…/neondb?sslmode=require' \
 *     pnpm neon:bootstrap
 *
 * Passwords come from SPECTACLE_OWNER_PASSWORD / APP_USER_PASSWORD /
 * AUTH_USER_PASSWORD when set, otherwise 32 random bytes each. Either way the
 * script prints the three connection strings once, on stdout, and stores them
 * nowhere — put them straight into the deployment's secret store.
 *
 * Idempotent: re-running re-applies the grants and rotates the passwords.
 */

const ROLES = ["spectacle_owner", "app_user", "auth_user"] as const;
type Role = (typeof ROLES)[number];

const PASSWORD_ENV: Record<Role, string> = {
  spectacle_owner: "SPECTACLE_OWNER_PASSWORD",
  app_user: "APP_USER_PASSWORD",
  auth_user: "AUTH_USER_PASSWORD",
};

/**
 * Neon exposes two hostnames per endpoint: `ep-x-pooler.…` (PgBouncer,
 * transaction pooling) and `ep-x.…` (direct). Tenant and auth traffic want the
 * pooler — serverless functions open far more connections than Postgres can
 * hold. Migrations want the direct endpoint: the drizzle migrator takes a
 * session-lifetime advisory lock and runs multi-statement DDL, neither of
 * which is safe to hand to a transaction pooler.
 */
export function toDirectHost(url: string): string {
  const u = new URL(url);
  u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
  return u.toString();
}

export function withCredentials(url: string, user: string, password: string): string {
  const u = new URL(url);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(password);
  return u.toString();
}

function generatePassword(): string {
  // base64url: no ':', '@', '/' or '?', so it survives URL embedding unescaped
  return randomBytes(24).toString("base64url");
}

export async function bootstrapNeon(adminUrl: string): Promise<Record<Role, string>> {
  const passwords = Object.fromEntries(
    ROLES.map((r) => [r, process.env[PASSWORD_ENV[r]] || generatePassword()]),
  ) as Record<Role, string>;

  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    const who = await pool.query(
      "select current_user, current_database(), current_setting('server_version') as v",
    );
    console.log(
      `connected to ${who.rows[0].current_database} as ${who.rows[0].current_user} ` +
        `(PostgreSQL ${who.rows[0].v})`,
    );

    const sqlFile = path.join(__dirname, "bootstrap-roles.sql");
    await pool.query(readFileSync(sqlFile, "utf8"));
    console.log("bootstrap-roles.sql applied");

    // ALTER ROLE takes no bind parameters (nor does DO), so the password has
    // to be inlined. Role names come from the ROLES tuple, never from input,
    // and the password goes through the driver's own literal escaper.
    const client = await pool.connect();
    try {
      for (const role of ROLES) {
        await client.query(
          `ALTER ROLE ${role} PASSWORD ${client.escapeLiteral(passwords[role])}`,
        );
      }
    } finally {
      client.release();
    }
    console.log(`passwords set for ${ROLES.join(", ")}`);

    // The whole security model rests on these three roles being ordinary.
    // Neon could in principle hand out neon_superuser membership; assert it did not.
    const shape = await pool.query(
      `select rolname, rolsuper, rolbypassrls, rolcreaterole,
              pg_has_role(rolname, 'neon_superuser', 'member') as is_neon_superuser
       from pg_roles where rolname = any($1)`,
      [ROLES as unknown as string[]],
    );
    if (shape.rowCount !== ROLES.length) {
      throw new Error(`expected ${ROLES.length} roles, found ${shape.rowCount}`);
    }
    for (const r of shape.rows) {
      if (r.rolsuper || r.rolbypassrls || r.rolcreaterole || r.is_neon_superuser) {
        throw new Error(
          `${r.rolname} is over-privileged: ` +
            `super=${r.rolsuper} bypassrls=${r.rolbypassrls} ` +
            `createrole=${r.rolcreaterole} neon_superuser=${r.is_neon_superuser}`,
        );
      }
    }
    console.log("role shape verified: no SUPERUSER, no BYPASSRLS, no neon_superuser");
  } finally {
    await pool.end();
  }

  const pooled = adminUrl;
  const direct = toDirectHost(adminUrl);
  return {
    spectacle_owner: withCredentials(direct, "spectacle_owner", passwords.spectacle_owner),
    app_user: withCredentials(pooled, "app_user", passwords.app_user),
    auth_user: withCredentials(pooled, "auth_user", passwords.auth_user),
  };
}

if (require.main === module) {
  const adminUrl = process.env.NEON_ADMIN_URL;
  if (!adminUrl) {
    console.error(
      "NEON_ADMIN_URL is required — the Neon project's default-role connection string.",
    );
    process.exit(1);
  }
  bootstrapNeon(adminUrl)
    .then((urls) => {
      console.log(
        [
          "",
          "Connection strings — printed once, stored nowhere. Copy into your",
          "secret store (Vercel project env), then clear your shell history.",
          "",
          `DATABASE_URL=${urls.app_user}`,
          `DATABASE_URL_OWNER=${urls.spectacle_owner}`,
          `AUTH_DATABASE_URL=${urls.auth_user}`,
          "",
          "Next: DATABASE_URL_OWNER=… pnpm migrate && pnpm verify:neon",
        ].join("\n"),
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
