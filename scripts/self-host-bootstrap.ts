import { readFileSync } from "node:fs";
import path from "node:path";

import { Pool } from "pg";

import { loadLocalEnv } from "./load-local-env";
import { generatePassword, withCredentials } from "./neon-bootstrap";

/**
 * One-machine provisioning — the local counterpart of `pnpm neon:bootstrap`.
 * Run as the Postgres superuser (compose `postgres` role) AFTER the server
 * is up and BEFORE `pnpm migrate`. Not a fourth app connection string: the
 * admin URL is this one-time step only, like NEON_ADMIN_URL on the hosted path.
 *
 *   pnpm self-host:init-env          # writes gitignored .env if missing
 *   docker compose up -d db
 *   pnpm self-host:bootstrap         # reads .env; prints the three URLs once
 *
 * Passwords come from SPECTACLE_OWNER_PASSWORD / APP_USER_PASSWORD /
 * AUTH_USER_PASSWORD when set, otherwise 24 random bytes each. Either way
 * they are stored nowhere except the caller's `.env` if they put them there.
 *
 * Idempotent: re-running re-applies grants and sets the passwords again.
 */

const ROLES = ["spectacle_owner", "app_user", "auth_user"] as const;
type Role = (typeof ROLES)[number];

const PASSWORD_ENV: Record<Role, string> = {
  spectacle_owner: "SPECTACLE_OWNER_PASSWORD",
  app_user: "APP_USER_PASSWORD",
  auth_user: "AUTH_USER_PASSWORD",
};

const DB_NAME = "spectacle";

function adminUrlFromEnv(): string {
  if (process.env.POSTGRES_ADMIN_URL) return process.env.POSTGRES_ADMIN_URL;
  const password = process.env.POSTGRES_PASSWORD;
  if (!password) {
    throw new Error(
      "POSTGRES_ADMIN_URL or POSTGRES_PASSWORD is required (see SELF-HOST.md)",
    );
  }
  const host = process.env.SELF_HOST_DB_HOST ?? "127.0.0.1";
  const port = process.env.SELF_HOST_DB_PORT ?? "5432";
  const u = new URL("postgres://postgres@host/postgres");
  u.hostname = host;
  u.port = port;
  u.password = password;
  return u.toString();
}

export async function bootstrapSelfHost(adminUrl: string): Promise<Record<Role, string>> {
  const passwords = Object.fromEntries(
    ROLES.map((r) => [r, process.env[PASSWORD_ENV[r]] || generatePassword()]),
  ) as Record<Role, string>;

  const sqlFile = path.join(__dirname, "bootstrap-roles.sql");
  const bootstrapSql = readFileSync(sqlFile, "utf8");

  const admin = new URL(adminUrl);
  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    const who = await pool.query(
      "select current_user, current_database(), current_setting('server_version') as v",
    );
    console.log(
      `connected to ${who.rows[0].current_database} as ${who.rows[0].current_user} ` +
        `(PostgreSQL ${who.rows[0].v})`,
    );

    await pool.query(bootstrapSql);
    console.log("bootstrap-roles.sql applied on current database");

    const currentDb = String(who.rows[0].current_database);
    if (currentDb !== DB_NAME) {
      const exists = await pool.query("select 1 from pg_database where datname = $1", [DB_NAME]);
      if ((exists.rowCount ?? 0) === 0) {
        await pool.query(`CREATE DATABASE ${DB_NAME} OWNER spectacle_owner`);
        console.log(`created database ${DB_NAME} owner spectacle_owner`);
      } else {
        console.log(`database ${DB_NAME} already exists`);
      }
    }
  } finally {
    await pool.end();
  }

  const spectacleUrl = new URL(adminUrl);
  spectacleUrl.pathname = `/${DB_NAME}`;
  const appPool = new Pool({ connectionString: spectacleUrl.toString(), max: 1 });
  try {
    await appPool.query(bootstrapSql);
    console.log(`bootstrap-roles.sql applied on ${DB_NAME}`);

    const client = await appPool.connect();
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

    const shape = await appPool.query(
      `select rolname, rolsuper, rolbypassrls, rolcreaterole
       from pg_roles where rolname = any($1)`,
      [ROLES as unknown as string[]],
    );
    if (shape.rowCount !== ROLES.length) {
      throw new Error(`expected ${ROLES.length} roles, found ${shape.rowCount}`);
    }
    for (const r of shape.rows) {
      if (r.rolsuper || r.rolbypassrls || r.rolcreaterole) {
        throw new Error(
          `${r.rolname} is over-privileged: ` +
            `super=${r.rolsuper} bypassrls=${r.rolbypassrls} ` +
            `createrole=${r.rolcreaterole}`,
        );
      }
    }
    console.log("role shape verified: no SUPERUSER, no BYPASSRLS");
  } finally {
    await appPool.end();
  }

  const base = new URL(adminUrl);
  base.pathname = `/${DB_NAME}`;
  base.username = "unused";
  base.password = "";
  const baseStr = `postgres://unused@${base.hostname}:${base.port || (admin.protocol === "postgres:" ? "5432" : base.port)}/${DB_NAME}`;

  return {
    spectacle_owner: withCredentials(baseStr, "spectacle_owner", passwords.spectacle_owner),
    app_user: withCredentials(baseStr, "app_user", passwords.app_user),
    auth_user: withCredentials(baseStr, "auth_user", passwords.auth_user),
  };
}

if (require.main === module) {
  loadLocalEnv();
  let url: string;
  try {
    url = adminUrlFromEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  bootstrapSelfHost(url)
    .then((urls) => {
      console.log(
        [
          "",
          "Connection strings — printed once, stored nowhere. Copy into `.env`",
          "if init-env did not already write them, then keep that file out of git.",
          "",
          `DATABASE_URL=${urls.app_user}`,
          `DATABASE_URL_OWNER=${urls.spectacle_owner}`,
          `AUTH_DATABASE_URL=${urls.auth_user}`,
          "",
          "Next: pnpm migrate && pnpm seed && pnpm build && pnpm start",
        ].join("\n"),
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
