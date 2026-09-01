# Audit — 2026-09-01

Branch `audit/2026-09-01`, base `main` @ `518941b`. Two phases: read-only scan
(this file), then Tier-1 fixes only after the draft PR existed.

## Scope and stack (as verified)

- Next.js 15.5.24 App Router, React 19, Better Auth 1.7.2, Drizzle 0.44.7 over
  `pg`, Neon Postgres with RLS. No `supabase/` tree exists; the verify-gates
  vendor scan (`no_hosted_platform_client`) is clean.
- No `NEXT_PUBLIC_*` / `VITE_*` variables anywhere — nothing paid or secret is
  shipped to the browser. `authClient` is `createAuthClient()` with no keys.
- No secrets in the tree or in git history (17 commits scanned for connection
  strings with passwords, AWS keys, private keys, auth secrets — only
  `CHANGE_ME` placeholders in an earlier `.env.example`).
- `DATABASE_URL` is guarded fail-closed against a privileged role
  (`src/db/client.internal.ts` checks SUPERUSER, BYPASSRLS and table
  ownership). `systemDb` is import-banned by ESLint and by the gate scan.

## Baseline (before any change)

| check | command | result |
| --- | --- | --- |
| typecheck | `pnpm typecheck` | PASS (exit 0) |
| lint | `pnpm lint` | PASS (0 errors, 0 warnings) |
| build | `pnpm build` | PASS — 14 routes, middleware 34.5 kB |
| themes | `pnpm verify:themes` | PASS (GREEN) |
| unit | `pnpm test` | **ENV-BLOCKED** — `No Postgres binaries found; set PGBIN` (203 tests skipped). No `initdb`/`pg_ctl`/docker on this VM; not installing tooling per audit rules. |
| gates | `pnpm verify:gates:canary` | **SKIPPED** — same reason. Static-scan subset run by hand: `import_ban_scan`, `storage_reads_no_env`, `no_canary_switch_in_src`, `no_drizzle_push_anywhere`, `no_hosted_platform_client` all clean. |
| live | `pnpm verify:neon` | SKIPPED — no live credentials in this environment. |
| audit | `pnpm audit` | 6 advisories: 3 high, 3 moderate (see S2, S4, S5). |

The DB-backed suites run in CI (`.github/workflows/ci.yml` installs PG17); this
PR's CI run is the authoritative signal for them.

## Findings (sorted by severity)

Severity: **High** / **Medium** / **Low** / **Info**. TIER 1 = fixed in this PR;
TIER 2 = needs approval, listed under "Needs approval" below.

### Security

| id | sev | where | problem | fix | tier |
| --- | --- | --- | --- | --- | --- |
| S1 | Medium | `src/app/auth/page.tsx:17` | Open redirect. `?next=` is accepted when it `startsWith("/")` and not `"//"`, but `/\evil.com` passes and WHATWG URL parsing (browsers, Next router, `new URL`) resolves it to `https://evil.com/`. Verified: `new URL("/\\evil.com","https://app.example").href === "https://evil.com/"`. Used by the server `redirect(safeNext)`, the client `router.push(destination)` and the Google `callbackURL`. | Reject a second character of `/` **or** `\` (`/^\/(?![\/\\])/`). One-line validator tightening; no auth-flow change. | 1 |
| S2 | High (dep) | `package.json` `drizzle-orm ^0.44.0` → resolved 0.44.7 | CVE-2026-39356 / GHSA-gpj5-g38j-94v9: `sql.identifier()` / `.as()` did not escape embedded quote delimiters. The app never builds identifiers or aliases from user input (all schema objects are static), so it is not exploitable here — but `better-auth@1.7.2` declares peer `drizzle-orm ^0.45.2`, which 0.44.7 does not satisfy. | Bump to `^0.45.2`. 0.45.0/0.45.1 are bug-fix releases (no breaking changes listed). Minor bump, lockfile only. | 1 |
| S3 | Low | `src/storage/index.ts:30`, `src/app/api/local-storage/route.ts:29` | Hard-coded fallback HMAC key `"local-dev-storage-secret"` when `BETTER_AUTH_SECRET` is unset. Unreachable in any working deployment (auth `need()`s the same secret), but a public constant must never be a valid signing key. | `need("BETTER_AUTH_SECRET")` — fail closed like the rest of the env surface. | 1 |
| S4 | Low | `pnpm-lock.yaml` → `next > postcss 8.4.31` | GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 (high), GHSA-qx2v-qp2m-jg93, GHSA-fxqj-rqcc-2cmp (moderate): build-time source-map path traversal via attacker-controlled CSS comments. All CSS here is first-party; build-time only. Our own `postcss` devDep already resolves to 8.5.26. | Wait for a `next` patch that bumps its pin, or add `pnpm.overrides.postcss: ">=8.5.23"` after verifying `next build`. Overriding a framework-pinned dependency is not a clean minor bump. | 2 |
| S5 | Low | `pnpm-lock.yaml` → `drizzle-kit > @esbuild-kit/* > esbuild 0.18.20` | GHSA-67mh-4wv8-2f99: esbuild dev-server CORS. Dev-only CLI path; `drizzle-kit` is used solely for `generate`. | Wait for drizzle-kit to drop `@esbuild-kit`; accepted risk. | 2 |
| S6 | Low | `.github/workflows/ci.yml` (job `gates`) | No `permissions:` block → workflow token gets the repository default (often `write`). CI only reads the checkout. | Add `permissions: contents: read` at workflow level. | 1 |
| S7 | Info | `drizzle/0002_rls.sql:279` `reviews_pub USING (true)` | Reviews (incl. `brand_id`, a user uuid) are readable anonymously. Storefronts show reviews publicly by design; the uuid is not otherwise sensitive. | None required; consider a view that omits `brand_id` if reviews grow. RLS change → approval. | 2 |
| S8 | Info | `next.config.ts` | No security headers (CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`); `poweredByHeader` left on. | Add a `headers()` block once a CSP has been designed against the canvas signature and fonts. Behaviour change. | 2 |
| S9 | Info | `src/storage/index.ts`, `src/app/api/local-storage/route.ts` | `BETTER_AUTH_SECRET` is reused as the local-storage HMAC key (key reuse). Dev/test adapter only; never used when R2 is configured. | Derive a sub-key (HKDF) or a dedicated `LOCAL_STORAGE_SECRET`. New env var → approval. | 2 |

### Correctness

| id | sev | where | problem | fix | tier |
| --- | --- | --- | --- | --- | --- |
| C1 | Medium | `src/app/bookings/[id]/page.tsx:49`, `src/app/book/[packageId]/page.tsx:33` | Route params flow straight into `eq(bookings.id, id)` / `eq(packages.id, packageId)`. A non-UUID (`/bookings/foo`) raises Postgres `22P02` → 500 error page instead of 404. | Validate with `z.string().uuid()`; `notFound()` on failure. | 1 |
| C2 | Low | `src/actions/settings.ts:241` `removePortfolioItemAction` | `id` is `String(formData.get("id"))`, never validated; a non-UUID raises `22P02` out of the Server Action (unhandled → generic error boundary). RLS (`portfolio_own`) already scopes the delete. Also currently unwired (no portfolio manager UI in Phase 1) — but any export of a `"use server"` module is a live endpoint. | Parse `id` with `z.string().uuid()` and return `{ error }`. | 1 |
| C3 | Low | `src/actions/bookings.ts:175` `loadBookingWorkspace` | Exported from a `"use server"` module → compiled into a publicly-callable Server Action, but nothing calls it (`/bookings/[id]` loads inline). Dead code that is also a gratuitous network endpoint (RLS-scoped, so no exposure). | Delete. | 1 |
| C4 | Low | `src/lib/env.ts:17` | `BETTER_AUTH_SECRET: z.string().min(16)` while README/.env.example require 32+ bytes. | Raise to `min(32)`. Could break an existing deploy with a shorter secret → approval. | 2 |
| C5 | Low | `src/app/c/[slug]/page.tsx:65-82` | `loadStorefront(slug)` runs in both `generateMetadata` and the page → 2 transactions × 5 queries per request. | Wrap in React `cache()` so the two calls share one result per request. | 1 |

### Hygiene

| id | sev | where | problem | fix | tier |
| --- | --- | --- | --- | --- | --- |
| H1 | Low | `src/db/schema.ts:49-56` | `FORMATS` / `Format` exported but unused; `creator-settings.tsx:25` and `validation/index.ts:74-77` carry their own copies. | Either import the schema constant in both places or delete it. Small consolidation refactor across 3 files. | 2 |
| H2 | Low | `tests/status-machine.test.ts:67-68` | `const edge = undefined as unknown; void edge;` placeholder. | Delete. (Cannot run the suite here; typecheck covers it.) | 2 |
| H3 | Info | `scripts/verify-gates.ts:13`, `tests/status-machine.test.ts:9`, `src/db/schema.ts:62` | Comments say "PG16" (README/CI: PG17) and "stamps via auth.api.updateUser" (code writes the row directly in `roles.ts`). | Comment fixes. | 2 |
| H4 | Info | `.github/workflows/ci.yml:3-5` | `on: push` + `on: pull_request` runs the ~5-minute suite twice for every PR branch; no `concurrency` group. | Restrict `push` to `main` and/or add `concurrency`. CI policy → approval. | 2 |
| H5 | Info | `package.json` | Majors available: next 16, eslint 10, eslint-config-next 16, tailwindcss 4, tailwind-merge 3, zod 4, vitest 4, typescript 7, @types/node 26. | Major bumps → approval. | 2 |
| H6 | Info | dependencies | No unused dependencies found (`react-dom`, `@types/pg`, `postcss`, `autoprefixer` are implicit consumers). | — | — |

## Needs approval (Tier 2)

- **S4** `pnpm.overrides` for the `postcss` nested under `next` (or wait for Next).
- **S5** esbuild 0.18 under drizzle-kit — accepted dev-only risk until upstream moves.
- **S7** `reviews_pub` exposes `brand_id` anonymously (RLS/view change).
- **S8** Security headers / CSP in `next.config.ts`.
- **S9** Dedicated local-storage signing key instead of reusing `BETTER_AUTH_SECRET`.
- **C4** `BETTER_AUTH_SECRET` minimum length 16 → 32.
- **H1** Consolidate the three format lists onto `schema.FORMATS`.
- **H2/H3** Test placeholder and stale comments.
- **H4** CI trigger de-duplication / concurrency.
- **H5** Major version bumps.

## Tier 1 — done (8 fixes, one commit each; cap reached)

| # | id | commit | change |
| --- | --- | --- | --- |
| 1 | S1 | `4feb3e1` | `/auth` rejects `?next=` whose second char is `/` or `\`. |
| 2 | C1 | `6323cc3` | `/bookings/[id]`, `/book/[packageId]` validate the UUID segment → 404, not 500. Adds `uuidSchema` to `src/lib/validation`. |
| 3 | C3 | `d0d92ec` | Deleted dead `loadBookingWorkspace` (a reachable `"use server"` export). |
| 4 | C2 | `f5a981d` | `removePortfolioItemAction` parses `id` as a UUID; returns an error state. |
| 5 | S3 | `585b79e` | Storage signing uses `need("BETTER_AUTH_SECRET")`; the constant fallback is gone from both call sites. |
| 6 | S2 | `17bfc17` | `drizzle-orm ^0.45.2` (lockfile: 0.44.7 → 0.45.2). Satisfies better-auth's peer range. |
| 7 | S6 | `518e01f` | CI workflow `permissions: contents: read`. |
| 8 | C5 | `a11e5aa` | `loadStorefront` wrapped in React `cache()`. |

Each commit was followed by `pnpm typecheck` and `pnpm lint`; S2 and C5 also by
`pnpm build`; `pnpm verify:themes` and the static gate scans re-run after the
last fix. Nothing was reverted to Tier 2.

## Before / after

| check | before (`518941b`) | after (`a11e5aa`) |
| --- | --- | --- |
| `pnpm typecheck` | PASS | PASS |
| `pnpm lint` | PASS (0/0) | PASS (0/0) |
| `pnpm build` | PASS | PASS (same 14 routes, `/c/[slug]` 987 B unchanged) |
| `pnpm verify:themes` | GREEN | GREEN |
| static gate scans | clean | clean |
| `pnpm audit` | 6 advisories (3 high, 3 moderate) | 5 advisories (2 high, 3 moderate) — remaining are all `postcss` under `next` (S4) and `esbuild` under `drizzle-kit` (S5) |
| `pnpm test`, `verify:gates:canary` | env-blocked (no PG binaries) | env-blocked — **CI on this PR is the authoritative run** |
| `verify:neon` | no credentials | no credentials |

Residual risk for reviewers: the drizzle-orm bump (S2) is the only change the
local toolchain could not exercise against a database; CI's
`verify:gates:canary` and the 203-cell status-machine suite cover it.
