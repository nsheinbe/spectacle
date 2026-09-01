/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client, Pool } from "pg";

/**
 * verify-neon — the live acceptance check for a provisioned Neon database.
 *
 * verify-gates is the adversarial suite, but it runs against a throwaway local
 * cluster: it proves the *design* holds, not that this deployment received it.
 * The gaps it structurally cannot see are the Neon-specific ones — the managed
 * role hierarchy, PgBouncer's connection reuse, and whether the journaled chain
 * actually reached this branch. That is what this script covers.
 *
 * Every assertion is READ-ONLY against application data. The one that writes
 * (`pooler_guc_is_transaction_local`) writes only a GUC, inside a transaction,
 * and touches no row. It is therefore safe to point at production, which is
 * the point: run it after `pnpm migrate` on every environment and branch.
 *
 * A skip is a failure. An assertion that cannot run exits non-zero rather than
 * quietly reporting green.
 */

const ROOT = path.resolve(__dirname, "..");

class Red extends Error {}
class Skip extends Error {}

function fail(msg: string): never {
  throw new Red(msg);
}

/** Every table the journaled chain creates — the migration-arrival inventory. */
const EXPECTED_TABLES = [
  "account",
  "booking_events",
  "bookings",
  "brief_responses",
  "briefs",
  "creator_profiles",
  "deliverables",
  "messages",
  "packages",
  "platform_config",
  "portfolio_items",
  "profiles",
  "reviews",
  "session",
  "usage_rights_options",
  "user",
  "verification",
  "webhook_events",
] as const;

const AUTH_TABLES = ["user", "session", "account", "verification"] as const;
const DOMAIN_TABLES = EXPECTED_TABLES.filter(
  (t) => !(AUTH_TABLES as readonly string[]).includes(t),
);

type Ctx = {
  app: Pool;
  auth: Pool;
  owner: Pool;
  appUrl: string;
};

type Assertion = { name: string; run: (ctx: Ctx) => Promise<void> };

const assertions: Assertion[] = [
  {
    // Neon's default role IS a member of neon_superuser and DOES have
    // BYPASSRLS. If provisioning ever hands the app that role — or grants the
    // membership to app_user — RLS becomes decorative and every other
    // assertion here still passes. Check this first.
    name: "app_role_is_unprivileged",
    run: async (ctx) => {
      const r = await ctx.app.query(
        `select current_user,
                rolsuper, rolbypassrls, rolcreaterole, rolcreatedb,
                pg_has_role(current_user, 'neon_superuser', 'member') as neon_su
         from pg_roles where rolname = current_user`,
      );
      const row = r.rows[0];
      if (row.current_user !== "app_user") fail(`DATABASE_URL connects as ${row.current_user}`);
      if (row.rolsuper) fail("app_user is SUPERUSER");
      if (row.rolbypassrls) fail("app_user has BYPASSRLS — RLS would not apply");
      if (row.neon_su) fail("app_user is a member of neon_superuser");
      if (row.rolcreaterole || row.rolcreatedb) fail("app_user has CREATEROLE/CREATEDB");

      const own = await ctx.app.query(
        `select count(*)::int as n from pg_tables
         where schemaname = 'public' and tableowner = current_user`,
      );
      if (own.rows[0].n > 0) fail(`app_user owns ${own.rows[0].n} table(s) — owners bypass RLS`);
    },
  },
  {
    // Same trap for the migration role: it must bypass RLS by *owning tables*,
    // never by holding the attribute — that is the whole "no BYPASSRLS" premise.
    name: "owner_role_is_unprivileged",
    run: async (ctx) => {
      const r = await ctx.owner.query(
        `select current_user, rolsuper, rolbypassrls,
                pg_has_role(current_user, 'neon_superuser', 'member') as neon_su
         from pg_roles where rolname = current_user`,
      );
      const row = r.rows[0];
      if (row.current_user !== "spectacle_owner")
        fail(`DATABASE_URL_OWNER connects as ${row.current_user}`);
      if (row.rolsuper || row.rolbypassrls || row.neon_su)
        fail(
          `spectacle_owner is over-privileged: super=${row.rolsuper} ` +
            `bypassrls=${row.rolbypassrls} neon_superuser=${row.neon_su}`,
        );
    },
  },
  {
    // Did the journaled chain actually reach THIS database? Compare the
    // drizzle journal against drizzle/meta/_journal.json rather than trusting
    // that `pnpm migrate` was pointed at the right branch.
    name: "migrations_fully_applied",
    run: async (ctx) => {
      const journalPath = path.join(ROOT, "drizzle", "meta", "_journal.json");
      const expected = JSON.parse(readFileSync(journalPath, "utf8")).entries.length as number;
      const r = await ctx.owner.query(
        "select count(*)::int as n from drizzle.__drizzle_migrations",
      );
      if (r.rows[0].n !== expected)
        fail(`${r.rows[0].n} migrations applied, _journal.json declares ${expected}`);

      const t = await ctx.owner.query(
        `select tablename, tableowner from pg_tables where schemaname = 'public'`,
      );
      const present = new Set<string>(t.rows.map((x: any) => x.tablename));
      const missing = EXPECTED_TABLES.filter((x) => !present.has(x));
      if (missing.length) fail(`tables missing: ${missing.join(", ")}`);
      const foreign = t.rows.filter((x: any) => x.tableowner !== "spectacle_owner");
      if (foreign.length)
        fail(
          `not owned by spectacle_owner: ${foreign
            .map((x: any) => `${x.tablename}=${x.tableowner}`)
            .join(", ")}`,
        );
    },
  },
  {
    // Plain ENABLE on every table, FORCE on none. FORCE would lock the owner
    // out of its own migrations and seeds; a missing ENABLE would expose a
    // table wholesale. Both are one ALTER TABLE away, so assert the exact shape.
    name: "rls_enabled_not_forced_everywhere",
    run: async (ctx) => {
      const r = await ctx.owner.query(
        `select relname, relrowsecurity, relforcerowsecurity
         from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`,
      );
      const off = r.rows.filter((x: any) => !x.relrowsecurity).map((x: any) => x.relname);
      if (off.length) fail(`RLS not enabled on: ${off.join(", ")}`);
      const forced = r.rows.filter((x: any) => x.relforcerowsecurity).map((x: any) => x.relname);
      if (forced.length) fail(`FORCE RLS set on: ${forced.join(", ")}`);
    },
  },
  {
    // THE Neon-specific risk. DATABASE_URL points at the PgBouncer endpoint,
    // where consecutive requests land on a shared backend. withUser() sets the
    // identity GUCs with is_local => true so they die at COMMIT; if that ever
    // regressed to session scope, request N+1 would silently inherit request
    // N's identity and read another tenant's rows with no error anywhere.
    //
    // max:1 forces the reuse this is testing, and the follow-up read asserts
    // the documented pooled artifact: the GUC comes back as '' (not NULL),
    // which is exactly why app_uid()/app_role() NULLIF-normalise it.
    name: "pooler_guc_is_transaction_local",
    run: async (ctx) => {
      const probe = new Pool({ connectionString: ctx.appUrl, max: 1 });
      try {
        const identity = "00000000-0000-4000-8000-0000000000ff";
        const c = await probe.connect();
        try {
          await c.query("BEGIN");
          await c.query(
            "select set_config('app.user_id',$1,true), set_config('app.user_role',$2,true)",
            [identity, "brand"],
          );
          const inTx = await c.query("select app_uid()::text as uid, app_role() as role");
          if (inTx.rows[0].uid !== identity)
            fail(`identity not visible inside its own transaction: ${inTx.rows[0].uid}`);
          if (inTx.rows[0].role !== "brand")
            fail(`role not visible inside its own transaction: ${inTx.rows[0].role}`);
          await c.query("COMMIT");
        } finally {
          c.release();
        }

        // Same pool, max:1 — almost certainly the same backend.
        const after = await probe.query(
          `select app_uid()::text as uid,
                  app_role() as role,
                  current_setting('app.user_id', true) as raw`,
        );
        if (after.rows[0].uid !== null)
          fail(`identity LEAKED across pooled requests: app_uid() = ${after.rows[0].uid}`);
        if (after.rows[0].role !== null)
          fail(`role LEAKED across pooled requests: app_role() = ${after.rows[0].role}`);
        if (after.rows[0].raw !== "" && after.rows[0].raw !== null)
          fail(`unexpected residual GUC value ${JSON.stringify(after.rows[0].raw)}`);
      } finally {
        await probe.end();
      }
    },
  },
  {
    // No identity set → every tenant table reads empty, and no error. A
    // fresh connection, so the '' artifact above cannot mask a real failure.
    name: "anonymous_reads_are_empty",
    run: async (ctx) => {
      const c = new Client({ connectionString: ctx.appUrl });
      await c.connect();
      try {
        for (const table of ["profiles", "bookings", "messages", "deliverables", "reviews"]) {
          const r = await c.query(`select count(*)::int as n from "${table}"`);
          if (r.rows[0].n !== 0)
            fail(`anonymous read of ${table} returned ${r.rows[0].n} rows`);
        }
      } finally {
        await c.end().catch(() => {});
      }
    },
  },
  {
    // status/payment_state exist only via schema defaults and the SECURITY
    // DEFINER function; profiles.role is pinned at INSERT and immutable after.
    // Column privileges are the enforcement — assert the negative space.
    name: "column_allowlists_intact",
    run: async (ctx) => {
      const banned: Array<[string, string, string[]]> = [
        ["bookings", "status", ["INSERT", "UPDATE"]],
        ["bookings", "payment_state", ["INSERT", "UPDATE"]],
        ["profiles", "role", ["UPDATE"]],
        ["profiles", "id", ["UPDATE"]],
      ];
      for (const [table, column, privs] of banned) {
        const r = await ctx.owner.query(
          `select privilege_type from information_schema.column_privileges
           where table_schema='public' and table_name=$1 and column_name=$2
             and grantee='app_user' and privilege_type = any($3)`,
          [table, column, privs],
        );
        if (r.rowCount)
          fail(
            `app_user holds ${r.rows.map((x: any) => x.privilege_type).join("/")} ` +
              `on ${table}.${column}`,
          );
      }
      // booking_events is append-only-by-the-owner: SELECT and nothing else.
      const ev = await ctx.owner.query(
        `select distinct privilege_type from information_schema.table_privileges
         where table_schema='public' and table_name='booking_events' and grantee='app_user'`,
      );
      const got = ev.rows.map((x: any) => x.privilege_type).sort();
      if (got.join(",") !== "SELECT")
        fail(`app_user privileges on booking_events: [${got.join(", ")}], expected [SELECT]`);
    },
  },
  {
    // The two connection pools are meant to be disjoint: Better Auth can
    // never read the marketplace, and the marketplace can never read
    // credentials. One stray GRANT collapses that.
    name: "auth_and_domain_grants_are_disjoint",
    run: async (ctx) => {
      const leaked = await ctx.owner.query(
        `select grantee, table_name, privilege_type
         from information_schema.table_privileges
         where table_schema = 'public'
           and (   (grantee = 'auth_user' and table_name = any($1))
                or (grantee = 'app_user'  and table_name = any($2)))`,
        [DOMAIN_TABLES, AUTH_TABLES as unknown as string[]],
      );
      if (leaked.rowCount)
        fail(
          `cross-domain grants: ${leaked.rows
            .map((x: any) => `${x.grantee}:${x.privilege_type} on ${x.table_name}`)
            .join(", ")}`,
        );

      // And prove it at runtime, not just in the catalog.
      const r = await ctx.auth.query(
        "select has_table_privilege('auth_user','bookings','SELECT') as can_read",
      );
      if (r.rows[0].can_read) fail("auth_user can SELECT bookings");
    },
  },
  {
    // The status trust boundary: owner-owned, SECURITY DEFINER, pinned
    // search_path with pg_temp last, EXECUTE to app_user and nobody else.
    name: "transition_function_shape",
    run: async (ctx) => {
      const r = await ctx.owner.query(
        `select prosecdef, proconfig, pg_get_userbyid(proowner) as owner, proacl::text
         from pg_proc
         where pronamespace = 'public'::regnamespace and proname = 'booking_status_transition'`,
      );
      if (r.rowCount !== 1) fail(`expected 1 booking_status_transition, found ${r.rowCount}`);
      const fn = r.rows[0];
      if (!fn.prosecdef) fail("booking_status_transition is not SECURITY DEFINER");
      if (fn.owner !== "spectacle_owner") fail(`function owned by ${fn.owner}`);
      const cfg: string[] = fn.proconfig ?? [];
      if (!cfg.some((c) => /^search_path=public,\s*pg_temp$/.test(c)))
        fail(`search_path not pinned to "public, pg_temp": ${JSON.stringify(cfg)}`);
      if (!/app_user=X/.test(fn.proacl ?? "")) fail(`app_user lacks EXECUTE: ${fn.proacl}`);
      if (/\bPUBLIC=X|^\{=X/.test(fn.proacl ?? "")) fail(`PUBLIC holds EXECUTE: ${fn.proacl}`);
    },
  },
  {
    // bootstrap-roles.sql closes these; a Neon database created outside that
    // script would silently leave both open.
    name: "no_temp_or_create_for_tenants",
    run: async (ctx) => {
      const r = await ctx.owner.query(
        `select has_database_privilege('public', current_database(), 'TEMP')     as public_temp,
                has_schema_privilege('app_user',  'public', 'CREATE')            as app_create,
                has_schema_privilege('auth_user', 'public', 'CREATE')            as auth_create,
                has_schema_privilege('app_user',  'drizzle', 'USAGE')            as app_journal`,
      );
      const row = r.rows[0];
      if (row.public_temp) fail("PUBLIC still holds TEMPORARY on the database");
      if (row.app_create) fail("app_user can CREATE in schema public");
      if (row.auth_create) fail("auth_user can CREATE in schema public");
      if (row.app_journal) fail("app_user can read the drizzle migration journal");
    },
  },
];

/* ────────────────────────── runner ────────────────────────── */

function requireUrl(key: string): string {
  const v = process.env[key];
  if (!v) throw new Skip(`${key} is not set`);
  return v;
}

async function main(): Promise<void> {
  let ctx: Ctx | null = null;
  const results = new Map<string, { ok: boolean; msg?: string; skipped?: boolean }>();

  try {
    const appUrl = requireUrl("DATABASE_URL");
    ctx = {
      appUrl,
      app: new Pool({ connectionString: appUrl, max: 2 }),
      auth: new Pool({ connectionString: requireUrl("AUTH_DATABASE_URL"), max: 1 }),
      owner: new Pool({ connectionString: requireUrl("DATABASE_URL_OWNER"), max: 2 }),
    };
  } catch (e: any) {
    console.error(`verify-neon SKIPPED: ${e.message} — a skip is a failure, not a pass.`);
    process.exit(1);
  }

  console.log(`verify-neon — ${assertions.length} assertions against the live database\n`);

  try {
    for (const a of assertions) {
      try {
        await a.run(ctx);
        results.set(a.name, { ok: true });
        console.log(`  ✓ ${a.name}`);
      } catch (e: any) {
        const skipped = e instanceof Skip;
        results.set(a.name, { ok: false, msg: e?.message, skipped });
        console.log(`  ${skipped ? "⚠ SKIPPED" : "✗ RED"} ${a.name} — ${e?.message}`);
      }
    }
  } finally {
    await Promise.allSettled([ctx.app.end(), ctx.auth.end(), ctx.owner.end()]);
  }

  const failed = [...results.values()].filter((r) => !r.ok && !r.skipped).length;
  const skipped = [...results.values()].filter((r) => r.skipped).length;
  if (failed || skipped) {
    console.error(
      `\nverify-neon: ${failed} RED, ${skipped} SKIPPED (a skip is a failure, not a pass).`,
    );
    process.exit(1);
  }
  console.log(`\nverify-neon: GREEN — all ${assertions.length} assertions`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
