/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, statSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

import { Client, Pool, type PoolClient } from "pg";

import { FX, seedFixtures } from "./fixtures";
import { withThrowawayDb, type ThrowawayDb } from "./with-throwaway-db";

/**
 * verify-gates — the adversarial proof that the database boundary holds.
 *
 * Runs against an ephemeral local PG16 (real migrations, real roles),
 * CONNECTS AS app_user (and self-asserts that), and drives an allow/deny
 * matrix across anon / brand A / brand B / creator A / creator B, plus the
 * storage participant gates and static source scans.
 *
 * --canary: applies one crafted fail-open mutation per row, asserts the
 * named assertion(s) flip RED while every other assertion stays green,
 * reverts, and asserts green-after-revert. Mutations are committed DDL/DCL,
 * so per-row revert + the everything-else-green cross-check make
 * contamination self-detecting. Where a mutation inherently reddens a
 * documented sibling (permissive SELECT policies OR together, so widening
 * either bookings arm exposes rows to BOTH non-participant probes), the row
 * declares the full expected-RED set explicitly — nothing flips silently.
 *
 * Skip-safety: an assertion that cannot run throws Skip(reason); ANY skip
 * prints SKIPPED <reason> and forces a non-zero exit — a missing env var
 * never looks like a pass.
 */

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

class Red extends Error {}
class Skip extends Error {}

function fail(msg: string): never {
  throw new Red(msg);
}

/* ────────────────────────── probe helpers ────────────────────────── */

type Probe = { state: string | null; rowCount: number; rows: any[] };

async function query(c: PoolClient | Client, text: string, params?: any[]): Promise<Probe> {
  await c.query("SAVEPOINT p");
  try {
    const r = await c.query(text, params);
    await c.query("RELEASE SAVEPOINT p");
    return { state: null, rowCount: r.rowCount ?? 0, rows: r.rows };
  } catch (e: any) {
    await c.query("ROLLBACK TO SAVEPOINT p");
    return { state: typeof e?.code === "string" ? e.code : "UNKNOWN", rowCount: 0, rows: [] };
  }
}

type Ctx = {
  db: ThrowawayDb;
  appPool: Pool;
  authPool: Pool;
  ownerPool: Pool;
  /** canary row 7: harness-side fault injection (constructor seam, no env var) */
  presignNoop: boolean;
  presign: {
    makeDeliverablePresigner: (opts: any) => { presignGet: (s: any, b: string, k: string) => Promise<string> };
    isBookingParticipant: (s: any, b: string) => Promise<boolean>;
    authorizePutKey: (s: any, k: string) => Promise<boolean>;
    port: any;
    StorageForbiddenError: new () => Error;
  };
};

/** Authenticated probe as app_user; the whole probe transaction rolls back. */
async function asUser<T>(
  ctx: Ctx,
  uid: string,
  role: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await ctx.appPool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "select set_config('app.user_id',$1,true), set_config('app.user_role',$2,true)",
      [uid, role],
    );
    return await fn(c);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    c.release();
  }
}

/**
 * Anonymous probe on a FRESH connection (never pooled): a pooled client that
 * ever defined the GUC placeholder reports '' after rollback, which is
 * exactly the condition the dedicated pooled-reuse assertion tests — every
 * OTHER anon probe must see a truly-undefined GUC.
 */
async function asAnon<T>(ctx: Ctx, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: ctx.db.appUrl });
  await c.connect();
  try {
    await c.query("BEGIN");
    return await fn(c);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end().catch(() => {});
  }
}

async function asAuthUser<T>(ctx: Ctx, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await ctx.authPool.connect();
  try {
    await c.query("BEGIN");
    return await fn(c);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    c.release();
  }
}

async function ownerControl(ctx: Ctx, text: string, params?: any[]): Promise<Probe> {
  const c = await ctx.ownerPool.connect();
  try {
    await c.query("BEGIN");
    const r = await query(c, text, params);
    return r;
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    c.release();
  }
}

const session = {
  brandA: { userId: FX.users.brandA, role: "brand" as const },
  brandB: { userId: FX.users.brandB, role: "brand" as const },
  creatorA: { userId: FX.users.creatorAOwner, role: "creator" as const },
  creatorB: { userId: FX.users.creatorBOwner, role: "creator" as const },
};

const NEW_BOOKING_COLS =
  "(brand_id, creator_id, package_id, usage_rights_option_id, title, brief, price_cents, fee_cents)";
const NEW_BOOKING_VALS = [
  FX.users.brandA,
  FX.creators.creatorA,
  FX.packages.pkgA,
  FX.rights.uroA,
  "Probe booking",
  "probe",
  300000,
  30000,
];

/* ────────────────────────── static scans ────────────────────────── */

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

export function importBanViolations(): string[] {
  const violations: string[] = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (rel.startsWith("src/db/")) continue;
    const text = readFileSync(file, "utf8");
    const inAuthLib = rel.startsWith("src/lib/auth/");
    const importRe = /from\s+["'][^"']*db\/(rls|client\.internal|auth-db)(\.js)?["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(text))) {
      if (m[1] === "auth-db" && inAuthLib) continue;
      violations.push(`${rel}: imports db/${m[1]}`);
    }
    if (/\bsystemDb\b/.test(text)) {
      violations.push(`${rel}: references systemDb`);
    }
  }
  return violations;
}

function storageEnvViolations(): string[] {
  return walk(path.join(SRC, "storage"))
    .filter((f) => readFileSync(f, "utf8").includes("process.env"))
    .map((f) => path.relative(ROOT, f));
}

function canaryStringViolations(): string[] {
  return walk(SRC)
    .filter((f) => readFileSync(f, "utf8").includes("CANARY" + "_"))
    .map((f) => path.relative(ROOT, f));
}

function drizzlePushViolations(): string[] {
  const targets = [path.join(ROOT, "package.json")];
  const wfDir = path.join(ROOT, ".github", "workflows");
  if (existsSync(wfDir)) {
    for (const f of readdirSync(wfDir)) targets.push(path.join(wfDir, f));
  }
  return targets
    .filter((f) => /drizzle-kit\s+(push|migrate)/.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
}

/* ────────────────────────── assertions ────────────────────────── */

type Assertion = { name: string; run: (ctx: Ctx) => Promise<void> };

const assertions: Assertion[] = [
  {
    // A suite that runs as owner proves nothing.
    name: "suite_runs_as_unprivileged_app_user",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const who = await c.query(
          "select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user",
        );
        const row = who.rows[0];
        if (row.current_user !== "app_user") fail(`connected as ${row.current_user}`);
        if (row.rolsuper) fail("app_user is superuser");
        if (row.rolbypassrls) fail("app_user has BYPASSRLS");
        const own = await c.query(
          "select tableowner from pg_tables where schemaname='public' and tablename='bookings'",
        );
        if (own.rows[0].tableowner === "app_user") fail("app_user owns tables");
      });
    },
  },
  {
    // A local superuser could mint BYPASSRLS and mask the Neon gap — prove
    // the deployable owner shape instead.
    name: "owner_shape_matches_neon",
    run: async (ctx) => {
      const r = await ownerControl(
        ctx,
        "select rolsuper, rolbypassrls from pg_roles where rolname = 'spectacle_owner'",
      );
      if (r.rowCount !== 1) fail("spectacle_owner missing");
      if (r.rows[0].rolsuper) fail("owner is superuser");
      if (r.rows[0].rolbypassrls) fail("owner has BYPASSRLS — undeployable on Neon");
    },
  },
  {
    name: "sd_function_search_path_pinned",
    run: async (ctx) => {
      const r = await ownerControl(
        ctx,
        "select proconfig from pg_proc where proname = 'booking_status_transition'",
      );
      if (r.rowCount !== 1) fail("function missing");
      const cfg: string[] = r.rows[0].proconfig ?? [];
      const sp = cfg.find((s) => s.startsWith("search_path="));
      if (!sp) fail("no search_path pinned");
      if (!/pg_temp$/.test(sp)) fail(`pg_temp not last: ${sp}`);
    },
  },
  {
    name: "anon_can_read_published_storefront",
    run: async (ctx) => {
      await asAnon(ctx, async (c) => {
        const r = await query(c, "select slug from public_creator_view order by slug");
        if (r.state) fail(`anon view read errored: ${r.state}`);
        if (r.rowCount < 2) fail(`expected >=2 published creators, got ${r.rowCount}`);
        if (r.rows.some((row) => row.slug === FX.slugs.unpub)) fail("unpublished slug leaked into view");
      });
    },
  },
  {
    name: "anon_cannot_read_unpublished_storefront",
    run: async (ctx) => {
      const control = await ownerControl(
        ctx,
        "select 1 from creator_profiles where published = false",
      );
      if (control.rowCount < 1) fail("positive control: no unpublished creator seeded");
      await asAnon(ctx, async (c) => {
        const r = await query(
          c,
          "select slug from creator_profiles where published = false",
        );
        if (r.state) fail(`errored: ${r.state}`);
        if (r.rowCount !== 0) fail(`unpublished storefront visible to anon (${r.rowCount} rows)`);
      });
    },
  },
  {
    name: "anon_gets_zero_bookings_silently",
    run: async (ctx) => {
      await asAnon(ctx, async (c) => {
        const r = await query(c, "select id from bookings");
        if (r.state) fail(`anon bookings select errored: ${r.state} (must be silent 0 rows)`);
        if (r.rowCount !== 0) fail(`anon sees ${r.rowCount} bookings`);
      });
    },
  },
  {
    name: "brandA_can_read_own_booking",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(c, "select brief from bookings where id = $1", [FX.bookings.bookingA]);
        if (r.rowCount !== 1) fail("brand A cannot read own booking");
      });
    },
  },
  {
    name: "creatorA_can_read_own_bookings",
    run: async (ctx) => {
      await asUser(ctx, FX.users.creatorAOwner, "creator", async (c) => {
        const r = await query(c, "select id from bookings where creator_id = $1", [FX.creators.creatorA]);
        if (r.rowCount < 3) fail(`creator A sees ${r.rowCount} of their bookings`);
      });
    },
  },
  {
    name: "brandB_cannot_read_brandA_booking_and_brief",
    run: async (ctx) => {
      const control = await ownerControl(ctx, "select 1 from bookings where id = $1", [
        FX.bookings.bookingA,
      ]);
      if (control.rowCount !== 1) fail("positive control: bookingA missing");
      await asUser(ctx, FX.users.brandB, "brand", async (c) => {
        const r = await query(c, "select brief from bookings where id = $1", [FX.bookings.bookingA]);
        if (r.state) fail(`errored: ${r.state}`);
        if (r.rowCount !== 0) fail("brand B can read brand A's booking/brief");
      });
    },
  },
  {
    name: "creatorB_cannot_read_creatorA_bookings",
    run: async (ctx) => {
      await asUser(ctx, FX.users.creatorBOwner, "creator", async (c) => {
        const r = await query(c, "select id from bookings where creator_id = $1", [FX.creators.creatorA]);
        if (r.state) fail(`errored: ${r.state}`);
        if (r.rowCount !== 0) fail(`creator B sees ${r.rowCount} of creator A's bookings`);
      });
    },
  },
  {
    name: "participants_can_read_messages",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(c, "select body from messages where booking_id = $1", [FX.bookings.bookingA]);
        if (r.rowCount !== 2) fail(`participant sees ${r.rowCount}/2 messages`);
      });
    },
  },
  {
    name: "brandB_cannot_read_brandA_messages",
    run: async (ctx) => {
      const control = await ownerControl(ctx, "select 1 from messages where booking_id = $1", [
        FX.bookings.bookingA,
      ]);
      if (control.rowCount !== 2) fail("positive control: seeded messages missing");
      await asUser(ctx, FX.users.brandB, "brand", async (c) => {
        const r = await query(c, "select body from messages where booking_id = $1", [FX.bookings.bookingA]);
        if (r.state) fail(`errored: ${r.state}`);
        if (r.rowCount !== 0) fail("brand B can read brand A's messages");
      });
    },
  },
  {
    name: "brand_insert_booking_defaults_to_inquiry",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(
          c,
          `insert into bookings ${NEW_BOOKING_COLS} values ($1,$2,$3,$4,$5,$6,$7,$8) returning status, payment_state`,
          NEW_BOOKING_VALS,
        );
        if (r.state) fail(`allowlisted insert raised ${r.state}`);
        if (r.rows[0].status !== "inquiry" || r.rows[0].payment_state !== "none")
          fail(`born as ${r.rows[0].status}/${r.rows[0].payment_state}`);
      });
    },
  },
  {
    name: "brand_cannot_insert_booking_with_status_other_than_inquiry",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(
          c,
          `insert into bookings (brand_id, creator_id, package_id, usage_rights_option_id, title, brief, price_cents, fee_cents, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,'paid_out') returning status`,
          NEW_BOOKING_VALS,
        );
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? `success(${r.rows[0]?.status})`}`);
      });
    },
  },
  {
    name: "brand_cannot_insert_booking_for_other_brand",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const vals = [...NEW_BOOKING_VALS];
        vals[0] = FX.users.brandB;
        const r = await query(
          c,
          `insert into bookings ${NEW_BOOKING_COLS} values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          vals,
        );
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "brandA_can_update_own_booking_title",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(c, "update bookings set title = 'Renamed' where id = $1", [
          FX.bookings.bookingA,
        ]);
        if (r.state) fail(`errored: ${r.state}`);
        if (r.rowCount !== 1) fail(`rowCount ${r.rowCount} — UPDATE policy missing?`);
      });
    },
  },
  {
    // NOTE: a WHERE-targeted probe cannot see this leak — an UPDATE whose
    // WHERE reads columns is additionally filtered by SELECT policies, which
    // still hide foreign rows. An UNQUALIFIED update (constant SET, no WHERE,
    // no RETURNING) is gated by the UPDATE policy's USING alone, so rowCount
    // reveals exactly how many rows bookings_upd_brand admits.
    name: "brandB_cannot_update_brandA_booking_title",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandB, "brand", async (c) => {
        const r = await query(c, "update bookings set title = 'sweep'");
        if (r.state) fail(`errored: ${r.state}`);
        if (r.rowCount !== 1)
          fail(`unqualified update touched ${r.rowCount} rows — brand B owns exactly 1 editable booking`);
      });
    },
  },
  {
    name: "nobody_can_write_bookings_status_directly",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(c, "update bookings set status = 'paid_out' where id = $1", [
          FX.bookings.bookingA,
        ]);
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? `success(rows=${r.rowCount})`}`);
      });
    },
  },
  {
    name: "nobody_can_update_booking_events",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(
          c,
          "update booking_events set to_status = 'paid_out' where booking_id = $1",
          [FX.bookings.bookingA],
        );
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? `success(rows=${r.rowCount})`}`);
      });
    },
  },
  {
    name: "nobody_can_insert_booking_events",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(
          c,
          "insert into booking_events (booking_id, actor_id, from_status, to_status) values ($1,$2,'inquiry','proposal')",
          [FX.bookings.bookingA, FX.users.brandA],
        );
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "self_insert_admin_role_raises",
    run: async (ctx) => {
      await asUser(ctx, FX.users.roleless, "brand", async (c) => {
        const r = await query(
          c,
          "insert into profiles (id, role, full_name) values ($1, 'admin', 'Sneaky')",
          [FX.users.roleless],
        );
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? "success"} — admin self-assignable`);
      });
    },
  },
  {
    name: "role_selection_can_insert_brand_profile",
    run: async (ctx) => {
      await asUser(ctx, FX.users.roleless, "brand", async (c) => {
        const r = await query(
          c,
          "insert into profiles (id, role, full_name) values ($1, 'brand', 'New Brand') returning role",
          [FX.users.roleless],
        );
        if (r.state) fail(`errored: ${r.state}`);
      });
    },
  },
  {
    name: "cannot_insert_profile_for_other_user",
    run: async (ctx) => {
      await asUser(ctx, FX.users.roleless, "brand", async (c) => {
        const r = await query(
          c,
          "insert into profiles (id, role, full_name) values ($1, 'brand', 'Impostor')",
          [FX.users.brandA],
        );
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "profiles_role_is_immutable",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(c, "update profiles set role = 'admin' where id = $1", [FX.users.brandA]);
        if (r.state !== "42501") fail(`expected 42501 (no column grant), got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "app_user_cannot_touch_auth_tables",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        for (const probe of [
          'select * from "user" limit 1',
          `insert into "session" (expires_at, token, user_id) values (now(), 'tok', '${FX.users.brandA}')`,
          'select * from "account" limit 1',
          'select * from "verification" limit 1',
        ]) {
          const r = await query(c, probe);
          if (r.state !== "42501") fail(`${probe.slice(0, 30)}… expected 42501, got ${r.state ?? "success"}`);
        }
      });
    },
  },
  {
    name: "auth_user_cannot_read_domain_tables",
    run: async (ctx) => {
      await asAuthUser(ctx, async (c) => {
        for (const table of ["profiles", "bookings", "messages", "platform_config"]) {
          const r = await query(c, `select * from ${table} limit 1`);
          if (r.state !== "42501") fail(`${table}: expected 42501, got ${r.state ?? "success"}`);
        }
      });
    },
  },
  {
    name: "auth_user_can_crud_auth_tables",
    run: async (ctx) => {
      await asAuthUser(ctx, async (c) => {
        const r = await query(
          c,
          `insert into "user" (name, email) values ('probe', 'probe@example.com') returning id`,
        );
        if (r.state) fail(`auth_user insert into user raised ${r.state}`);
      });
    },
  },
  {
    name: "forged_sender_id_raises",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(
          c,
          "insert into messages (booking_id, sender_id, body) values ($1, $2, 'spoof')",
          [FX.bookings.bookingA, FX.users.creatorAOwner],
        );
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "participant_can_send_message",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(
          c,
          "insert into messages (booking_id, sender_id, body) values ($1, $2, 'hello')",
          [FX.bookings.bookingA, FX.users.brandA],
        );
        if (r.state) fail(`errored: ${r.state}`);
      });
    },
  },
  {
    name: "nonparticipant_cannot_send_message",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandB, "brand", async (c) => {
        const r = await query(
          c,
          "insert into messages (booking_id, sender_id, body) values ($1, $2, 'intrude')",
          [FX.bookings.bookingA, FX.users.brandB],
        );
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "brand_cannot_upload_deliverable",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(
          c,
          "insert into deliverables (booking_id, uploader_id, storage_key, file_name, mime_type) values ($1,$2,'k','f','video/mp4')",
          [FX.bookings.bookingA, FX.users.brandA],
        );
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "creator_can_upload_deliverable",
    run: async (ctx) => {
      await asUser(ctx, FX.users.creatorAOwner, "creator", async (c) => {
        const r = await query(
          c,
          "insert into deliverables (booking_id, uploader_id, storage_key, file_name, mime_type) values ($1,$2,'deliverables/x/y/z','f','video/mp4')",
          [FX.bookings.bookingA, FX.users.creatorAOwner],
        );
        if (r.state) fail(`errored: ${r.state}`);
      });
    },
  },
  {
    name: "brand_cannot_review_without_paid_out_booking",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandB, "brand", async (c) => {
        const r = await query(
          c,
          "insert into reviews (booking_id, brand_id, creator_id, rating, body) values ($1,$2,$3,5,'fake')",
          [FX.bookings.bookingB, FX.users.brandB, FX.creators.creatorB],
        );
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? "success"} — fake review possible`);
      });
    },
  },
  {
    name: "brand_can_review_paid_out_booking",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(
          c,
          "insert into reviews (booking_id, brand_id, creator_id, rating, body) values ($1,$2,$3,5,'great')",
          [FX.bookings.bookingPaid, FX.users.brandA, FX.creators.creatorA],
        );
        if (r.state) fail(`errored: ${r.state}`);
      });
    },
  },
  {
    name: "negative_price_package_raises_check",
    run: async (ctx) => {
      await asUser(ctx, FX.users.creatorAOwner, "creator", async (c) => {
        const r = await query(
          c,
          "insert into packages (creator_id, name, price_cents) values ($1, 'Bad', -5000)",
          [FX.creators.creatorA],
        );
        if (r.state !== "23514") fail(`expected 23514 CHECK violation, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "creatorB_cannot_update_creatorA_package",
    run: async (ctx) => {
      await asUser(ctx, FX.users.creatorBOwner, "creator", async (c) => {
        const r = await query(c, "update packages set price_cents = 1 where id = $1", [FX.packages.pkgA]);
        if (r.state) fail(`errored: ${r.state}`);
        if (r.rowCount !== 0) fail("creator B updated creator A's package");
      });
    },
  },
  {
    name: "sd_transition_happy_path_rederives_price",
    run: async (ctx) => {
      await asUser(ctx, FX.users.creatorAOwner, "creator", async (c) => {
        const r = await query(
          c,
          "select status, price_cents, fee_cents from booking_status_transition($1, 'proposal')",
          [FX.bookings.bookingA2],
        );
        if (r.state) fail(`transition raised ${r.state}`);
        const row = r.rows[0];
        if (row.status !== "proposal") fail(`status ${row.status}`);
        if (row.price_cents !== 300000) fail(`price not re-derived: ${row.price_cents}`);
        if (row.fee_cents !== 30000) fail(`fee not re-derived: ${row.fee_cents}`);
        const ev = await query(
          c,
          "select 1 from booking_events where booking_id = $1 and to_status = 'proposal'",
          [FX.bookings.bookingA2],
        );
        if (ev.rowCount !== 1) fail("no booking_events row appended (owner-shape write failed?)");
      });
    },
  },
  {
    name: "sd_transition_wrong_party_raises",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(c, "select booking_status_transition($1, 'proposal')", [
          FX.bookings.bookingA2,
        ]);
        if (r.state !== "SP002") fail(`expected SP002, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "sd_transition_illegal_edge_raises",
    run: async (ctx) => {
      await asUser(ctx, FX.users.creatorAOwner, "creator", async (c) => {
        const r = await query(c, "select booking_status_transition($1, 'funded')", [
          FX.bookings.bookingA2,
        ]);
        if (r.state !== "SP001") fail(`expected SP001, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "sd_transition_not_yet_enabled_raises",
    run: async (ctx) => {
      await asUser(ctx, FX.users.creatorAOwner, "creator", async (c) => {
        const r = await query(c, "select booking_status_transition($1, 'declined')", [
          FX.bookings.bookingA2,
        ]);
        if (r.state !== "SP003") fail(`expected SP003, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "sd_transition_system_only_rejects_all_app_callers",
    run: async (ctx) => {
      await asUser(ctx, FX.users.brandA, "brand", async (c) => {
        const r = await query(c, "select booking_status_transition($1, 'funded')", [
          FX.bookings.bookingAwait,
        ]);
        if (r.state !== "SP004") fail(`expected SP004, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "sd_transition_nonparticipant_forbidden",
    run: async (ctx) => {
      await asUser(ctx, FX.users.creatorBOwner, "creator", async (c) => {
        const r = await query(c, "select booking_status_transition($1, 'proposal')", [
          FX.bookings.bookingA2,
        ]);
        if (r.state !== "42501") fail(`expected 42501, got ${r.state ?? "success"}`);
      });
    },
  },
  {
    name: "sd_transition_anon_forbidden",
    run: async (ctx) => {
      await asAnon(ctx, async (c) => {
        const r = await query(c, "select booking_status_transition($1, 'proposal')", [
          FX.bookings.bookingA2,
        ]);
        if (r.state !== "42501") fail(`expected 42501 (NULL-GUC guard), got ${r.state ?? "success"}`);
      });
    },
  },
  {
    // The pooled-reuse case: after an authenticated tx, the GUC placeholder
    // reverts to '' on that connection — app_uid()'s NULLIF must keep anon
    // silent-zero-rows with NO 22P02.
    name: "anon_on_reused_connection_gets_silent_zero_rows",
    run: async (ctx) => {
      const c = new Client({ connectionString: ctx.db.appUrl });
      await c.connect();
      try {
        await c.query("BEGIN");
        await c.query(
          "select set_config('app.user_id',$1,true), set_config('app.user_role',$2,true)",
          [FX.users.brandA, "brand"],
        );
        await c.query("select 1 from bookings limit 1");
        await c.query("COMMIT");
        await c.query("BEGIN");
        const raw = await c.query("select current_setting('app.user_id', true) as v");
        if (raw.rows[0].v !== "" && raw.rows[0].v !== null)
          fail(`GUC leaked across transactions: ${raw.rows[0].v}`);
        const books = await query(c, "select id from bookings");
        if (books.state) fail(`bookings read raised ${books.state} (22P02 = missing NULLIF)`);
        if (books.rowCount !== 0) fail(`anon-on-reused sees ${books.rowCount} bookings`);
        const view = await query(c, "select slug from public_creator_view");
        if (view.state) fail(`view read raised ${view.state}`);
        if (view.rowCount < 2) fail("public view broken on reused connection");
        const fn = await query(c, "select booking_status_transition($1, 'proposal')", [
          FX.bookings.bookingA2,
        ]);
        if (fn.state !== "42501") fail(`SD fn expected 42501, got ${fn.state ?? "success"}`);
        await c.query("ROLLBACK");
      } finally {
        await c.end().catch(() => {});
      }
    },
  },
  {
    name: "deliverable_presign_participant_only",
    run: async (ctx) => {
      const { makeDeliverablePresigner, isBookingParticipant, port, StorageForbiddenError } =
        ctx.presign;
      const presigner = makeDeliverablePresigner({
        port,
        // Canary row 7 injects the no-op at the CONSTRUCTOR (harness-side
        // fault injection): no env var, no branch in shipped code.
        assertParticipant: ctx.presignNoop ? async () => true : isBookingParticipant,
      });
      const key = `deliverables/${FX.bookings.bookingA}/${FX.deliverables.d1}/final.mp4`;
      let leaked = false;
      try {
        await presigner.presignGet(session.brandB, FX.bookings.bookingA, key);
        leaked = true;
      } catch (e) {
        if (!(e instanceof StorageForbiddenError)) fail(`unexpected error: ${e}`);
      }
      if (leaked) fail("non-participant minted a deliverable URL");
      try {
        await presigner.presignGet(
          session.brandA,
          FX.bookings.bookingB,
          key, // key belongs to bookingA — foreign prefix must always deny
        );
        fail("foreign-prefix key presigned");
      } catch (e) {
        if (!(e instanceof StorageForbiddenError)) throw e;
      }
      const url = await presigner.presignGet(session.brandA, FX.bookings.bookingA, key);
      if (!url.includes(encodeURIComponent(key)) && !url.includes(key))
        fail("participant URL missing key");
    },
  },
  {
    name: "presign_put_scoped_per_prefix",
    run: async (ctx) => {
      const { authorizePutKey } = ctx.presign;
      const deliverableKey = `deliverables/${FX.bookings.bookingA}/new/file.mp4`;
      if (await authorizePutKey(session.brandA, deliverableKey))
        fail("brand may not PUT deliverables");
      if (!(await authorizePutKey(session.creatorA, deliverableKey)))
        fail("creator participant denied deliverable PUT");
      if (await authorizePutKey(session.creatorB, deliverableKey))
        fail("foreign creator may PUT deliverables");
      const portfolioKey = `portfolio/${FX.creators.creatorA}/hero.jpg`;
      if (!(await authorizePutKey(session.creatorA, portfolioKey)))
        fail("owner denied portfolio PUT");
      if (await authorizePutKey(session.creatorB, portfolioKey))
        fail("foreign creator may PUT portfolio");
      if (!(await authorizePutKey(session.brandA, `avatars/${FX.users.brandA}`)))
        fail("self avatar PUT denied");
      if (await authorizePutKey(session.brandA, `avatars/${FX.users.brandB}`))
        fail("foreign avatar PUT allowed");
      if (await authorizePutKey(session.brandA, "elsewhere/whatever"))
        fail("unknown prefix allowed");
    },
  },
  {
    name: "import_ban_scan",
    run: async () => {
      const v = importBanViolations();
      if (v.length) fail(`import ban violations:\n  ${v.join("\n  ")}`);
    },
  },
  {
    name: "storage_reads_no_env",
    run: async () => {
      const v = storageEnvViolations();
      if (v.length) fail(`process.env in src/storage/**: ${v.join(", ")}`);
    },
  },
  {
    name: "no_canary_switch_in_src",
    run: async () => {
      const v = canaryStringViolations();
      if (v.length) fail(`CANARY_ string in src/**: ${v.join(", ")}`);
    },
  },
  {
    name: "no_drizzle_push_anywhere",
    run: async () => {
      const v = drizzlePushViolations();
      if (v.length) fail(`drizzle-kit push/migrate referenced in: ${v.join(", ")}`);
    },
  },
];

/* ────────────────────────── canary table ────────────────────────── */

type CanaryRow = {
  id: number;
  label: string;
  /** the named assertion(s) that MUST flip RED; everything else must stay green */
  flips: string[];
  apply: (ctx: Ctx) => Promise<void>;
  revert: (ctx: Ctx) => Promise<void>;
};

const APP_UID_ORIGINAL = `CREATE OR REPLACE FUNCTION app_uid() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$`;

async function ownerExec(ctx: Ctx, ...statements: string[]): Promise<void> {
  const c = await ctx.ownerPool.connect();
  try {
    for (const s of statements) await c.query(s);
  } finally {
    c.release();
  }
}

const CANARY_PROBE_FILE = path.join(SRC, "lib", "__canary_import_probe__.ts");

// The classic fail-opens. Where permissive policies OR together, widening one
// bookings SELECT arm exposes rows to BOTH non-participant read assertions —
// each row declares its full expected-RED set; the cross-check still proves
// nothing ELSE flipped and revert restores green.
const canaryRows: CanaryRow[] = [
  {
    id: 1,
    label: "bookings_sel_brand loses tenant scope (auth-only check remains)",
    flips: [
      "brandB_cannot_read_brandA_booking_and_brief",
      "creatorB_cannot_read_creatorA_bookings",
    ],
    apply: (ctx) =>
      ownerExec(ctx, "ALTER POLICY bookings_sel_brand ON bookings USING (app_uid() IS NOT NULL)"),
    revert: (ctx) =>
      ownerExec(ctx, "ALTER POLICY bookings_sel_brand ON bookings USING (brand_id = app_uid())"),
  },
  {
    id: 2,
    label: "bookings_sel_creator loses tenant scope",
    flips: [
      "brandB_cannot_read_brandA_booking_and_brief",
      "creatorB_cannot_read_creatorA_bookings",
    ],
    apply: (ctx) =>
      ownerExec(ctx, "ALTER POLICY bookings_sel_creator ON bookings USING (app_uid() IS NOT NULL)"),
    revert: (ctx) =>
      ownerExec(
        ctx,
        `ALTER POLICY bookings_sel_creator ON bookings USING (
           EXISTS (SELECT 1 FROM public.creator_profiles cp
                   WHERE cp.id = bookings.creator_id AND cp.user_id = app_uid()))`,
      ),
  },
  {
    id: 3,
    label: "messages_sel loses participant scope",
    flips: ["brandB_cannot_read_brandA_messages"],
    apply: (ctx) =>
      ownerExec(ctx, "ALTER POLICY messages_sel ON messages USING (app_uid() IS NOT NULL)"),
    revert: (ctx) =>
      ownerExec(ctx, "ALTER POLICY messages_sel ON messages USING (is_booking_participant(booking_id))"),
  },
  {
    id: 4,
    label: "creator_profiles_pub exposes unpublished",
    flips: ["anon_cannot_read_unpublished_storefront"],
    apply: (ctx) => ownerExec(ctx, "ALTER POLICY creator_profiles_pub ON creator_profiles USING (true)"),
    revert: (ctx) =>
      ownerExec(ctx, "ALTER POLICY creator_profiles_pub ON creator_profiles USING (published)"),
  },
  {
    id: 5,
    label: "booking_events gains UPDATE grant",
    flips: ["nobody_can_update_booking_events"],
    apply: (ctx) => ownerExec(ctx, "GRANT UPDATE ON booking_events TO app_user"),
    revert: (ctx) => ownerExec(ctx, "REVOKE UPDATE ON booking_events FROM app_user"),
  },
  {
    id: 6,
    label: "bookings.status gains column UPDATE grant",
    flips: ["nobody_can_write_bookings_status_directly"],
    apply: (ctx) => ownerExec(ctx, "GRANT UPDATE (status) ON bookings TO app_user"),
    revert: (ctx) => ownerExec(ctx, "REVOKE UPDATE (status) ON bookings FROM app_user"),
  },
  {
    id: 7,
    label: "presigner participant gate no-ops (constructor fault injection)",
    flips: ["deliverable_presign_participant_only"],
    apply: async (ctx) => {
      ctx.presignNoop = true;
    },
    revert: async (ctx) => {
      ctx.presignNoop = false;
    },
  },
  {
    id: 8,
    label: "bookings INSERT re-widened to table-wide AND status pin dropped",
    // Defense-in-depth means the true fail-open needs BOTH layers gone: with
    // only the grant widened, the bookings_ins_brand status pin still raises
    // — which is the point of the second layer. This row removes both.
    flips: ["brand_cannot_insert_booking_with_status_other_than_inquiry"],
    apply: (ctx) =>
      ownerExec(
        ctx,
        "GRANT INSERT ON bookings TO app_user",
        "ALTER POLICY bookings_ins_brand ON bookings WITH CHECK (brand_id = app_uid())",
      ),
    revert: (ctx) =>
      ownerExec(
        ctx,
        "REVOKE INSERT ON bookings FROM app_user",
        // column-level INSERT allowlist survives the table-level revoke, but
        // re-granting keeps restoration independent of ACL subtleties —
        // green-after-revert plus the clean-run suite prove the final state.
        "GRANT INSERT (brand_id, creator_id, package_id, usage_rights_option_id, title, brief, price_cents, fee_cents) ON bookings TO app_user",
        `ALTER POLICY bookings_ins_brand ON bookings WITH CHECK (
           brand_id = app_uid() AND status = 'inquiry' AND payment_state = 'none')`,
      ),
  },
  {
    id: 9,
    label: "bookings_upd_brand loses row scope",
    flips: ["brandB_cannot_update_brandA_booking_title"],
    apply: (ctx) =>
      ownerExec(ctx, "ALTER POLICY bookings_upd_brand ON bookings USING (true) WITH CHECK (true)"),
    revert: (ctx) =>
      ownerExec(
        ctx,
        `ALTER POLICY bookings_upd_brand ON bookings
           USING (brand_id = app_uid() AND status IN ('inquiry','proposal'))
           WITH CHECK (brand_id = app_uid())`,
      ),
  },
  {
    id: 10,
    label: "profiles_ins drops the role pin",
    flips: ["self_insert_admin_role_raises"],
    apply: (ctx) =>
      ownerExec(ctx, "ALTER POLICY profiles_ins ON profiles WITH CHECK (id = app_uid())"),
    revert: (ctx) =>
      ownerExec(
        ctx,
        "ALTER POLICY profiles_ins ON profiles WITH CHECK (id = app_uid() AND role IN ('brand','creator'))",
      ),
  },
  {
    id: 11,
    label: "app_uid() loses NULLIF ('' reaches ::uuid on reused connections)",
    flips: ["anon_on_reused_connection_gets_silent_zero_rows"],
    apply: (ctx) =>
      ownerExec(
        ctx,
        `CREATE OR REPLACE FUNCTION app_uid() RETURNS uuid
           LANGUAGE sql STABLE PARALLEL SAFE
           AS $$ SELECT current_setting('app.user_id', true)::uuid $$`,
      ),
    revert: (ctx) => ownerExec(ctx, APP_UID_ORIGINAL),
  },
  {
    id: 12,
    label: "SD function search_path unpinned",
    flips: ["sd_function_search_path_pinned"],
    apply: (ctx) =>
      ownerExec(ctx, "ALTER FUNCTION booking_status_transition(uuid, booking_status) RESET search_path"),
    revert: (ctx) =>
      ownerExec(
        ctx,
        "ALTER FUNCTION booking_status_transition(uuid, booking_status) SET search_path = public, pg_temp",
      ),
  },
  {
    id: 13,
    label: "src/lib file laundering a private db import",
    flips: ["import_ban_scan"],
    apply: async () => {
      writeFileSync(
        CANARY_PROBE_FILE,
        `import { getAppPool } from "../db/client.internal";\nexport const leak = getAppPool;\n`,
      );
    },
    revert: async () => {
      rmSync(CANARY_PROBE_FILE, { force: true });
    },
  },
];

/* ────────────────────────── runner ────────────────────────── */

type Outcome = { ok: boolean; skipped?: string; error?: string };

async function runAll(ctx: Ctx): Promise<Map<string, Outcome>> {
  const results = new Map<string, Outcome>();
  for (const a of assertions) {
    try {
      await a.run(ctx);
      results.set(a.name, { ok: true });
    } catch (e: any) {
      if (e instanceof Skip) results.set(a.name, { ok: false, skipped: e.message });
      else results.set(a.name, { ok: false, error: e?.message ?? String(e) });
    }
  }
  return results;
}

function report(results: Map<string, Outcome>): { failed: number; skipped: number } {
  let failed = 0;
  let skipped = 0;
  for (const [name, r] of results) {
    if (r.ok) console.log(`  ✓ ${name}`);
    else if (r.skipped) {
      console.log(`  ○ SKIPPED ${name} — ${r.skipped}`);
      skipped++;
    } else {
      console.log(`  ✗ ${name} — ${r.error}`);
      failed++;
    }
  }
  return { failed, skipped };
}

async function runCanary(ctx: Ctx): Promise<boolean> {
  let allOk = true;
  for (const row of canaryRows) {
    console.log(`\n— canary ${row.id}: ${row.label}`);
    await row.apply(ctx);
    try {
      const mutated = await runAll(ctx);
      for (const [name, r] of mutated) {
        const mustBeRed = row.flips.includes(name);
        if (mustBeRed && r.ok) {
          console.log(`  ✗ canary NOT detected: ${name} stayed green`);
          allOk = false;
        } else if (!mustBeRed && !r.ok) {
          console.log(`  ✗ collateral red: ${name} — ${r.error ?? r.skipped}`);
          allOk = false;
        }
      }
      if (row.flips.every((name) => !(mutated.get(name)?.ok ?? true))) {
        console.log(`  ✓ RED as expected: ${row.flips.join(", ")}`);
      }
    } finally {
      await row.revert(ctx);
    }
    for (const name of row.flips) {
      const a = assertions.find((x) => x.name === name);
      if (!a) {
        console.log(`  ✗ unknown assertion ${name}`);
        allOk = false;
        continue;
      }
      try {
        await a.run(ctx);
        console.log(`  ✓ green after revert: ${name}`);
      } catch (e: any) {
        console.log(`  ✗ STILL RED after revert: ${name} — ${e?.message}`);
        allOk = false;
      }
    }
  }
  return allOk;
}

async function main(): Promise<void> {
  const canaryMode = process.argv.includes("--canary");

  // Skip-safety inventory: the throwaway harness supplies every DB URL; if it
  // ever cannot, that is a SKIP (non-zero), not a silent pass.
  await withThrowawayDb(async (db) => {
    process.env.DATABASE_URL = db.appUrl;
    process.env.DATABASE_URL_OWNER = db.ownerUrl;
    process.env.AUTH_DATABASE_URL = db.authUrl;
    process.env.BETTER_AUTH_SECRET = "verify-gates-secret-32-bytes-min!";

    await seedFixtures(db.ownerUrl);

    const presignMod = await import("../src/storage/presign");
    const portMod = await import("../src/storage/port");
    const localFs = await import("../src/storage/local-fs");

    const ctx: Ctx = {
      db,
      appPool: new Pool({ connectionString: db.appUrl, max: 4 }),
      authPool: new Pool({ connectionString: db.authUrl, max: 2 }),
      ownerPool: new Pool({ connectionString: db.ownerUrl, max: 2 }),
      presignNoop: false,
      presign: {
        makeDeliverablePresigner: presignMod.makeDeliverablePresigner,
        isBookingParticipant: presignMod.isBookingParticipant,
        authorizePutKey: presignMod.authorizePutKey,
        port: localFs.makeLocalFsAdapter({
          baseUrl: "http://localhost:3000",
          secret: "verify-gates-storage",
        }),
        StorageForbiddenError: portMod.StorageForbiddenError,
      },
    };

    try {
      console.log(`verify-gates — ${assertions.length} assertions, connecting as app_user\n`);
      const clean = await runAll(ctx);
      const { failed, skipped } = report(clean);
      if (skipped > 0) {
        console.error(`\n${skipped} assertion(s) SKIPPED — a skip is a failure, not a pass.`);
        process.exitCode = 1;
        return;
      }
      if (failed > 0) {
        console.error(`\n${failed} assertion(s) RED.`);
        process.exitCode = 1;
        return;
      }
      console.log(`\nclean run: all ${clean.size} assertions green`);

      if (canaryMode) {
        const ok = await runCanary(ctx);
        if (!ok) {
          console.error("\ncanary: FAILED — a fail-open mutation went undetected or leaked.");
          process.exitCode = 1;
          return;
        }
        console.log(`\ncanary: all ${canaryRows.length} rows detected, reverted, re-greened`);
      }
      console.log("\nverify-gates: GREEN");
    } finally {
      const dbMod = await import("../src/db/rls");
      const clientMod = await import("../src/db/client.internal");
      await Promise.allSettled([
        ctx.appPool.end(),
        ctx.authPool.end(),
        ctx.ownerPool.end(),
        dbMod._closeSystemPool(),
        clientMod._closeAppPool(),
      ]);
      rmSync(CANARY_PROBE_FILE, { force: true });
    }
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
