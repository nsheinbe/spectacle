# Spectacle

Booking + usage-rights marketplace for **spectacle advertising** — projection mapping,
FOOH/CGI, anamorphic billboards, drone shows, street art. Brands book a creator's
productized package from a themed storefront; creators respond with a proposal; the
database — not the application — enforces who may do what.

**Phase 1** (this repo): themed creator storefronts, booking to `awaiting_payment`
(brand accepts a proposal, then waits), and the shared workspace. **No Stripe, no
capture, no payouts, no discovery** (`/browse` is behind `FEATURE_BROWSE=false` with
no UI). Never the word "escrow": the column is `payment_state`, the status is `funded`.

## Quick start

Prereqs: Node 22, pnpm 10, PostgreSQL 16 server binaries (`initdb`/`pg_ctl` — the
verify scripts spin up ephemeral clusters; `docker-compose.yml` is provided for a
long-lived dev DB if you prefer).

```sh
pnpm install

# All security gates against a throwaway PG16 (real migrations, real roles):
pnpm verify:gates            # 51-assertion allow/deny matrix
pnpm verify:gates:canary     # + 13 fail-open mutations, each proven detected
pnpm verify:themes           # WCAG AA + motion + stage/rail structure
pnpm test                    # exhaustive status-machine grid (203 tests)

# A long-lived dev database:
docker compose up -d db      # or any local PG16
psql -U postgres -h localhost -f scripts/bootstrap-roles.sql
psql -U postgres -h localhost -c "CREATE DATABASE spectacle OWNER spectacle_owner"
psql -U postgres -h localhost -d spectacle -f scripts/bootstrap-roles.sql
cp .env.example .env         # fill in the three connection strings + secret
pnpm migrate
pnpm seed                    # demo creators/brands; prints login credentials
pnpm dev
```

Environment variables are documented in [.env.example](.env.example) — the three
database URLs map one-to-one onto the three Postgres roles below.

## Security model — the database is the trust boundary

### Three roles, no FORCE RLS, no BYPASSRLS

| role | connects via | may touch |
| --- | --- | --- |
| `spectacle_owner` | `DATABASE_URL_OWNER` | owns all tables; migrations, seeds, (Phase 2) webhooks. Bypasses RLS **as table owner** under plain `ENABLE RLS`. |
| `app_user` | `DATABASE_URL` | all tenant traffic, subject to RLS. Domain tables only — zero grants on auth tables. |
| `auth_user` | `AUTH_DATABASE_URL` | Better Auth infra (`user`/`session`/`account`/`verification`) only — zero domain grants. |

**Why no `FORCE` and no `BYPASSRLS`:** Neon exposes no superuser, and `BYPASSRLS`
can only be minted by one — so a design that needs it passes locally and fails in
prod. Instead the owner bypasses RLS the only portable way (table ownership under
non-`FORCE` RLS), `scripts/bootstrap-roles.sql` is the one privileged step (run by
the initdb superuser locally, by Neon's default role once in prod), and
verify-gates asserts `spectacle_owner` has `rolbypassrls = false` so a local
superuser can never mask the gap.

### The write paths that matter

- `bookings` INSERT and UPDATE are **column allowlists** (`GRANT INSERT (…8 cols)`,
  `GRANT UPDATE (title, brief)`): `status`/`payment_state` are unwritable by
  `app_user` — they exist only via schema defaults (`'inquiry'`/`'none'`) and the
  `SECURITY DEFINER` function. An INSERT policy additionally pins
  `status = 'inquiry'` so the invariant survives a future grant widening.
- Status moves only through `booking_status_transition()` (owner-owned,
  `SET search_path = public, pg_temp`, schema-qualified body, raises `42501` on a
  NULL identity GUC, re-derives `price_cents`/`fee_cents` from
  `packages` + `usage_rights_options` + `platform_config` at `inquiry→proposal`,
  appends the `booking_events` audit row in the same transaction). Distinct
  SQLSTATEs map to typed TS errors; `TRANSITION_MATRIX` in
  `src/lib/bookings/transition.ts` is a UX mirror the test suite keeps in sync
  with the SQL.
- All GUC reads go through `app_uid()`/`app_role()` (`NULLIF(current_setting(…),'')`):
  on pooled connections an unset transaction-local GUC comes back as `''`, not
  NULL — the helpers keep anon requests silent-zero-rows instead of `22P02`.
- Storage: `presignGet` is participant-gated (explicit column predicates, key must
  match the booking prefix, 15-minute TTL); `presignPut` is authorized per key
  prefix. No env var can weaken either — verify-gates scans for exactly that.
- `src/db/index.ts` is the only sanctioned DB import surface. `systemDb` (owner)
  and the private pools are banned across `src/**` by ESLint **and** an fs scan.

### verify-gates (`scripts/verify-gates.ts`)

Boots a throwaway PG16 (`initdb` + `pg_ctl`), runs `bootstrap-roles.sql` + the real
journaled migrations + fixtures, then **connects as `app_user`** (self-asserting it
is not owner/superuser/BYPASSRLS) and drives 51 named assertions across anon,
brand A/B, creator A/B — reads, writes, transitions, presigning, static scans.

`--canary` then applies 13 crafted fail-open mutations — one per named assertion —
e.g. a policy that loses its tenant scope, `GRANT UPDATE (status)`, `app_uid()`
without `NULLIF`, an unpinned `search_path`, a laundered private import. For each
row the suite proves: the named assertion flips **RED**, every other assertion
stays green (declared collateral only: permissive SELECT policies OR together, so
widening either bookings arm trips both non-participant read probes), and after
the exact inverse revert the assertion is green again. Skips are failures: any
assertion that cannot run exits non-zero.

Two findings worth knowing when extending it:

- An `UPDATE … WHERE id = x` probe **cannot** detect a widened UPDATE policy —
  reading columns in WHERE re-applies SELECT policies, which still hide foreign
  rows. The canary probe for `bookings_upd_brand` is an unqualified UPDATE whose
  rowCount reveals exactly what the policy admits.
- drizzle's `insert()` names **every** column (passing `default` for the
  unspecified) and Postgres column privileges cover every *named* column — so
  bookings inserts use raw SQL naming only the allowlisted columns
  (`createBookingAction`, `scripts/seed.ts`).

### verify-themes (`scripts/verify-themes.ts`)

Per registered theme (registry in `src/themes/registry.ts`): WCAG AA for
`text`/`textMuted` against **both** stage backgrounds (≥ 4.5), large-text-only
`textFaint` (≥ 3.0), accent (≥ 3.0); a registered reduced-motion variant; at most
one rAF/canvas loop, IntersectionObserver-paused, static under
`prefers-reduced-motion`; no undeclared rAF anywhere; `src/components/rail/**`
imports no theme module. Rail contrast is asserted once globally — the booking
rail is a route-level **sibling** of the themed stage with its own constant
`#1C1710` background, so its contrast cannot vary by theme.

### Status-machine tests (`tests/status-machine.test.ts`)

Every cell of the 10×10 status grid × both parties (203 tests) against the real
SQL function on an ephemeral cluster, expectations derived from the TS mirror —
mirror drift fails CI. Phase 1 enables exactly `inquiry→proposal` (creator) and
`proposal→awaiting_payment` (brand); system edges (`awaiting_payment→funded`,
`approved→paid_out`) reject **all** app callers, always.

## Adding a theme

1. Add tokens (and optionally a signature component) to `src/themes/registry.ts`.
   A theme with a rAF loop sets `hasRafLoop: true` + `signatureFile`, must pause
   offscreen, and must render a static frame under `prefers-reduced-motion`.
2. Stage tokens only style the storefront under `[data-stage]`. Never import
   themes from the rail.
3. `pnpm verify:themes` — contrast and structure are enforced, not reviewed.

Phase 1 ships `projection` fully; `fooh`/`anamorphic`/`drone`/`street` are
AA-verified base-dark stubs awaiting art direction.

## Neon workflow

One-time, as the project's default role: run `scripts/bootstrap-roles.sql`
against your database, set passwords out-of-band
(`ALTER ROLE app_user PASSWORD '…'`, etc.), make `spectacle_owner` the database
owner. Per deploy: `pnpm migrate` with `DATABASE_URL_OWNER`. Branch-per-PR: create
a Neon branch, run `pnpm migrate` against it, point the preview deploy's three
URLs at the branch; roles are cluster-level on the branch already.

## Decision log

- **No FORCE RLS / no BYPASSRLS** — unprovisionable on Neon; owner-as-table-owner
  is the deployable shape and verify-gates proves that exact shape (see above).
- **`drizzle-kit push` / `drizzle-kit migrate` CLI are forbidden** — only
  `scripts/migrate.ts` applies the journaled chain (`drizzle/meta/_journal.json`),
  identically in dev/CI/prod. verify-gates greps for violations. Migrations are
  authored via `drizzle-kit generate` / `generate --custom`.
- **Better Auth runs as `auth_user`, never the owner**; its schema is checked into
  `src/db/schema.ts` (CLI-shape, incl. the 1.7 `account.issuer` column) and applied
  by the owner chain — Better Auth's migrator never runs.
- **Role is pinned at creation** by the profiles INSERT policy
  (`role IN ('brand','creator')`, `admin` unassignable via any app path) and
  immutable after (no UPDATE grant on the column). The session carries a UX copy
  on the Better Auth user record; `profiles.role` is authoritative.
- **Platform fee lives in the DB** (`platform_config`, owner-only) because the SD
  function must re-derive money without trusting the app; `PLATFORM_FEE_BPS` env
  only feeds UI estimates.
- **`bookings.updated_at`** exists for the SD-function stamp (not in the original
  column spec — logged).
- **Fonts are vendored woff2** via `next/font/local` (OFL permits self-hosting);
  builds need no font CDN.
- Residual, logged honestly: `price_cents`/`fee_cents` are insertable by a crafted
  brand INSERT on an `inquiry` row (the deriving Server Action runs as
  `app_user`); bounded by `CHECK (>= 0)` and **overwritten by the SD function's
  authoritative re-derivation** at `inquiry→proposal`, before any state that
  matters.

## Unproven without live credentials

This environment has no Neon, R2, or Google OAuth credentials. Everything up to
the network boundary is exercised for real (LocalFsAdapter implements the same
port; participant gates run before any adapter call). Two surfaces remain
unproven and should be run once credentials exist:

- **Real R2 signing round-trip** — set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_DELIVERABLES`, `R2_BUCKET_PUBLIC`, then
  upload through `/api/uploads` and fetch a deliverable URL from a workspace.
- **Google OAuth callback** — set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
  (button renders only when present), then complete one sign-in at `/auth`.

## Phase status

- **Phase 1 (this repo)**: storefronts, booking → `awaiting_payment`, workspace,
  gates. Done when: typecheck + build clean; verify-gates green incl. every canary
  row RED-then-green; verify-themes green; seed runs; status tests pass; all
  routes phone-reachable; both enabled edges exercisable from `/bookings/[id]`.
- **Phase 2**: Stripe (webhooks → `funded`/`paid_out` as system edges),
  deliverable uploads in the workspace, discovery behind `FEATURE_BROWSE`.
  `webhook_events` and the payment columns already exist so Phase 2 touches no
  existing structure.
- **Phase 3**: briefs marketplace (`briefs`/`brief_responses` tables ready).
