# Spectacle — build plan

Written 9 September 2026 against `main` @ `9cb5b50` (Merge PR #5). Planning
document only: no product code is changed by the pull request that adds it.

Living status — what is ticked, what is blocked, what was decided — lives in
[`PROGRESS.md`](PROGRESS.md). Update that file when a box changes, not only
when a phase closes.

**"Spectacle" is a working name**, not the public brand. Snap holds SPECTACLES
for AR glasses. The repo, `LICENSE`, and package name stay as they are until a
rename is chosen (parked). Do not treat the word as final in launch copy.

---

## The goal this plan completes

This repo is already a booking marketplace with the database as the trust
boundary. The brief that built that ("Phase 1 storefronts, booking to
`awaiting_payment`, workspace, gates") is finished.

The product this plan finishes is narrower and finite:

> **Open-source rails for booking spectacle advertising so both the marketing
> provider and the marketing purchaser keep more — by cutting about 18% of the
> fees closed platforms take — without making the product read as a crypto
> app.**

Solana (or any other rail that actually cuts fees and reaches a broad market)
is a **means**, not the brand. Do not make the product read as a wallet, a
chain, or a web3 app. Same family as Stead: community-owned rails, fee in the
open, secrets private.

**This plan is complete when Phases 1–3 have met their stop conditions.** Stripe
money-in and everything in [§6 Parked](#6-parked) sit outside that sentence.
They start only when promoted in `PROGRESS.md` after their gates clear.

---

## 1. What exists today

Honest inventory of `main` @ `9cb5b50`. "Done" means it works and is covered by
a test, a gate, or a live deploy path. "Partial" means the seam exists but the
far side does not. Do not invent numbers, ratings, or GMV.

### Done

| Area | State |
| --- | --- |
| **Apache-2.0, public repo** | `LICENSE` copyright "Spectacle contributors" (`cea2705`). Repo is public; marketplace landed in [PR #1](https://github.com/nsheinbe/spectacle/pull/1) (`518941b`). |
| **Marketplace Phase 1 (README)** | Themed creator storefronts (`/c/[slug]`), book flow (`/book/[packageId]`), booking to `awaiting_payment`, shared workspace (`/bookings/[id]`), dashboard, settings, onboarding, seed. |
| **Stack** | Next.js 15 App Router, React 19, Better Auth, Drizzle ORM over `pg`, Zod, Tailwind 3. Hosted on Vercel project `spectacle`. |
| **Neon Postgres, three roles, RLS** | `app_user` / `spectacle_owner` / `auth_user`. 6 journaled migrations (`drizzle/0000`–`0005`). `withUser()` sets identity GUCs; fails closed if `DATABASE_URL` is a privileged role (`src/db/client.internal.ts`). Hosted-stack notes in `CLAUDE.md` ([PR #3](https://github.com/nsheinbe/spectacle/pull/3)). Proven on a throwaway Neon branch (README "Proven against live Neon"). |
| **Status machine** | `booking_status_transition()` is the only writer of `status` / `payment_state`. Phase 1 enables `inquiry→proposal` (creator) and `proposal→awaiting_payment` (brand). System edges (`awaiting_payment→funded`, `approved→paid_out`) reject every app caller. 203-cell grid in `tests/status-machine.test.ts`. Never the word "escrow": the column is `payment_state`, the status is `funded`. |
| **Security gates** | `pnpm verify:gates:canary` — 55 assertions + 17 fail-open canaries on throwaway PG17. `pnpm verify:themes` — WCAG AA + motion + stage/rail split. `pnpm verify:neon` — 10 read-only live checks. CI (`.github/workflows/ci.yml`) runs canary, themes, tests, typecheck, lint, build. |
| **Audit 2026-09-01 Tier 1** | 8 fixes merged in [PR #4](https://github.com/nsheinbe/spectacle/pull/4). Residual Tier 2 items are parked (see [§6](#6-parked)). |
| **Health** | `GET /api/health` → `{ ok: true }`, no DB ([PR #5](https://github.com/nsheinbe/spectacle/pull/5)). |
| **Design tokens (1/n)** | `d0e64e1` — live Design chrome palette in `src/styles/tokens.css` + Tailwind maps. Rail stays constant `#1C1710`. Stage defaults track the Theme Contract's projection preset. |
| **Theme `projection`** | Fully registered, rAF signature, reduced-motion static frame. `fooh` / `anamorphic` / `drone` / `street` are AA-verified base-dark stubs. |
| **Storage port** | `StorageAdapter` with LocalFs (default) and R2. `presignPut` / `presignGet` are prefix-authorized before any adapter call. |
| **Fee number in the DB** | `platform_config.fee_bps` default **1000** (10%). `PLATFORM_FEE_BPS` is display-only; the SECURITY DEFINER function re-derives `fee_cents` at `inquiry→proposal`. |

### Partial — the seam is real, the far side is not

| Area | What is there | What is missing |
| --- | --- | --- |
| **Design import** | Tokens only (`d0e64e1`). Booking rail (`src/components/rail/booking-rail.tsx`) and storefront (`src/app/c/[slug]/page.tsx`) are functional Phase 1 UI, not the four live Design files. | Homepage, rail, storefront, and theme contract **layout** from [the live Design](https://claude.ai/design/p/d2d84e31-7d1f-45fc-93ea-b653ea666460). `src/app/page.tsx` still `redirect("/dashboard")`. No `LAUNCH_COPY`. |
| **Discovery** | `/browse` route + `FEATURE_BROWSE` (default `false`). | Flag stays off. Even when true the page 404s — "no UI in Phase 1 even when flagged on". |
| **Deliverables** | `deliverables` table, workspace **list**, `/api/uploads` presign, participant gates. | No insert path, no upload control in the workspace. Copy on the page says versions appear in a later phase. |
| **Local / hosted run** | README quick start, `docker-compose.yml` (Postgres 17 only), `pnpm migrate` / `seed` / `dev`, Vercel env contract. | No self-host path: no production runbook for someone who is not this Vercel+Neon project. Compose does not run the app. |
| **Fee policy** | Integer bps in `platform_config`, env estimate, README decision-log line. | No in-repo public policy. No "~18% cut" framing. No honest statement of what the take is versus a closed incumbent. |
| **Auth extras** | Email/password via Better Auth. Google button renders only when `GOOGLE_CLIENT_ID` is set. | Google OAuth callback unproven (no live credentials in-repo). |
| **Object storage** | LocalFs implements the same port as R2. | Real R2 signing round-trip unproven (no live credentials in-repo). |
| **Reviews** | Table, public RLS, storefront stars when rows exist. | No write UI. Seed does not create reviews. Do not invent ratings. |
| **Forward tables** | `webhook_events`, `briefs`, `brief_responses` created with **zero grants**. | No Stripe handler, no briefs UI, no money movement. |

### Missing entirely

- **Self-host path** as a first-class, documented way to run the rails (the open-source bar).
- **Fee policy in the open** (`FEE_POLICY.md` or equivalent; a public read of the live bps).
- **`LAUNCH_COPY`** and a marketing homepage that does not bounce to `/dashboard`.
- **Stripe** (or any processor). No SDK, no webhook route, no Connect. `awaiting_payment→funded` is system-only and disabled.
- **Outbound notification.** No email, SMS, or push. Better Auth sign-in is on-site.
- **Legal surface.** No terms, privacy, or booking agreement.
- **Product name.** Codename only.
- **Crypto / Solana / wallet rails.** None, and none belong in an active phase.

---

## 2. Phases

Four numbered phases. 1–3 are the completion path. Phase 4 is scheduled but
hard-gated. Each names what stops it.

README used "Phase 1 / 2 / 3" for marketplace / Stripe+uploads+browse / briefs.
That Phase 1 is **done** (inventory above). This file renumbers the *remaining*
work. Mapping: README Phase 2 splits into **Phase 3** (uploads + browse) and
**Phase 4** (Stripe, parked-until-gated). README Phase 3 (briefs) is parked.

---

### Phase 1 — Design import (remaining)

**Why first.** The live Design is the UI source of truth and only the palette
has landed. A homepage that redirects to `/dashboard` is not a product face.
Fee-cut and crypto copy are **not** in the Design and do not belong here.

**Source of UI truth** — four files in the live Claude Design
<https://claude.ai/design/p/d2d84e31-7d1f-45fc-93ea-b653ea666460>:

1. Spectacle Home
2. Booking Rail
3. Creator Storefront
4. Theme Contract

Marisol Vega and the extra BookingRail frames are **not** required.

**Scope**

- Replace the `/` redirect with the Home artboard. Honest `LAUNCH_COPY` only:
  what the app does today (book a creator package from a themed storefront;
  proposal; wait for payment). Codename stays. No invented GMV, no invented
  ratings, no "$12.4M".
- Apply Booking Rail and Creator Storefront to the existing routes
  (`BookingRail`, `/c/[slug]`). Keep the stage/rail split: theme the stage,
  never the rail (`#1C1710`).
- Honour the Theme Contract in tokens and stage overrides. Do not invent a
  second palette.
- Keep `FEATURE_BROWSE=false`. Do not add a browse UI here.
- Fee-cut / open-source / crypto language stays out unless a line is clearly
  labeled an honest promise (prefer none; Phase 2 owns that copy).

**Acceptance tests**

- `/` renders the Home artboard. It does not redirect to `/dashboard`.
- `LAUNCH_COPY` exists and every public sentence is true of `main` at merge
  (no simulated payments, no discovery, no live take-rate claim unless it
  matches `platform_config`).
- `/c/{seed-slug}` and the booking rail visually match the Design files, not
  just the token file. `pnpm verify:themes` stays green.
- Signed-in dashboard, book flow, and workspace still reach `awaiting_payment`
  for both enabled edges.
- `FEATURE_BROWSE` remains false; `/browse` still 404s.
- No new dependency. No `escrow` identifier. No personal name in UI copy.

**Out of scope.** Stripe, uploads UI, browse, self-host runbook, fee-policy
doc, stub-theme art direction, rename, Solana, briefs.

**Human gate.** None to start. The Design URL is the brief. If an artboard
disagrees with a security or honesty invariant, the invariant wins and the
deviation is logged in `PROGRESS.md`.

**Stop condition.** The four files are the running UI, copy is honest, gates
that already exist still pass.

---

### Phase 2 — Open rails, self-host, fee policy

**Why second.** Apache-2.0 and a public repo are already true. The rest of the
open-source bar is not: nobody else can run this, and the fee story is a
column default, not a policy.

**Scope**

- Self-host path in-repo: one documented way to run the app + Postgres 17 +
  the three roles + migrate + seed + `next start` (or equivalent) on a single
  machine, without Vercel or Neon. Compose may grow to cover the app; secrets
  stay in env, never in git.
- In-repo fee policy (new file, linked from README). Honest: the reason to
  exist is that both sides keep more because the take is lower than closed
  incumbents (~18% cut **framing**). State the actual live number
  (`platform_config.fee_bps`, today **1000** = 10% of booking) and that the
  database, not the env var, is authoritative. Do not invent a competitor's
  take.
- Language rules (Stead-shaped, Spectacle-specific): never blockchain, crypto,
  wallet, token, web3, DAO, smart contract, on-chain, gas, Solana-as-brand.
  Never "escrow" in code — `payment_state` / `funded`. Use: open source,
  self-host, fee policy, funded, keep more.
- Secrets remain private (`.gitignore`, Vercel/host env). No fourth connection
  string. No `NEXT_PUBLIC_` paid keys.

**Acceptance tests**

- A reader of the self-host doc can stand up the stack on one machine and hit
  `/api/health`, sign in with a seed account, and open a seeded storefront.
- Fee policy file states the framing, the actual bps, who pays it, and that
  `app_user` cannot write `platform_config`.
- Grep-clean: no banned crypto/wallet/web3 brand words in `src/`, `README.md`,
  or the new policy/self-host docs (Node `crypto` imports for HMAC/UUID stay).
- Existing CI stays green. No product-behavior change required beyond copy and
  docs; a public read of the live bps is allowed if it is not a new trust
  boundary.

**Out of scope.** Stripe, Design work leftover from Phase 1, browse, rename,
shipping a chain.

**Human gate.** None to start. Publishing a *different* bps than 1000 is a
product decision — record it in `PROGRESS.md` before changing the default.

**Stop condition.** Self-host is a documented path that has been followed once
in CI or a recorded local run, and the fee policy is in the repo.

---

### Phase 3 — Deliverable uploads and discovery

**Why third.** README already named these as the next marketplace slice.
Schema, storage port, and the browse flag exist; the UI and the write path
do not. No legal entity is required.

**Scope**

- Creator (participant) can upload a deliverable version in the booking
  workspace through the existing presign port. Brand (participant) can
  download via `presignGet`. Rows land in `deliverables`.
- Discovery behind `FEATURE_BROWSE`: a real `/browse` when the flag is true;
  still 404 when false. Default stays **false** until the page is honest
  (seeded creators only; no invented social proof).
- Do not enable `awaiting_payment→funded` here.

**Acceptance tests**

- A creator on a booking they participate in uploads a file; the brand sees
  the version; a stranger's presign is 403. verify-gates participant probes
  still pass.
- `FEATURE_BROWSE=false` → `/browse` is 404. `FEATURE_BROWSE=true` → a list
  of **published** storefronts, no invented ratings/GMV.
- LocalFs remains the no-R2 path. R2 stays optional.

**Out of scope.** Stripe, payouts, briefs, browse-on-by-default in production,
R2 live proof (still a credentials gap).

**Human gate.** None.

**Stop condition.** One booking shows a real uploaded version in the
workspace, and `/browse` is a flag-true page rather than a hard `notFound()`.

---

### Phase 4 — Stripe system edges (hard-gated)

**Why last among the numbered phases.** Money movement is the only remaining
README Phase 2 item, and it is the one that can cost a real person money.
`webhook_events` and the payment columns already exist so this phase should
not rewrite Phase 1 structure.

**Hard-gated.** Do not start before the Stripe account and legal-entity gates
in [§3](#3-hard-gates) clear. Test-mode keys alone are not a start signal if
the platform account is not on an entity that can accept marketplace terms.

**Scope** (only after gates)

- Webhooks as the sole writer of system edges: `awaiting_payment→funded`,
  later `approved→paid_out`. Owner connection, signature-verified, idempotent
  on `webhook_events`.
- Checkout from the existing awaiting-payment workspace card (the copy there
  already tells the truth: nothing is charged today).
- Language: `payment_state` / `funded`. Never "escrow".

**Acceptance tests**

- Test-mode checkout moves one booking to `funded` and `payment_state=funded`,
  writes an event row, and a replay of the same event is a no-op.
- An app_user caller still cannot take the system edges (status-machine +
  gates stay red on those cells).
- Live mode is unreachable without explicit live keys; test and live are
  separated by configuration.

**Out of scope.** Connect payouts beyond a single-platform charge if the
entity is not ready; multi-currency; crypto rails; briefs.

**Stop condition.** One test-mode booking, end to end, lands `funded` through
the webhook, not through a Server Action.

This phase is **not** required for the plan-complete sentence in the goal.

---

## 3. Hard gates

Work that cannot start until someone outside this repository provides
something. Each is a blocker, not a task. Track live status in `PROGRESS.md`.

| Gate | Blocks | What is needed |
| --- | --- | --- |
| **Stripe account on a legal entity** | Phase 4 entirely | A real Stripe account that can run a marketplace (Connect or the chosen charge shape), terms accepted. Test-mode keys on a personal account are not enough to *close* the phase. |
| **Legal entity and marketplace terms** | Phase 4; any public "we hold funds" claim | Who is the counterparty to a booking? Platform terms, usage-rights disclosure, and what `funded` means in law. Drafted by someone qualified. |
| **Product name** | Public brand, domain, App Store, trademark | A name that is not SPECTACLES. Until then the codename stays and launch copy does not pretend it is final. |
| **Live Design access** | Phase 1 polish only | The four artboards at the URL above. If they disappear, freeze the last applied tokens and stop inventing frames. |
| **R2 credentials** | Proving the R2 adapter, not shipping uploads | Account id + keys + two buckets. LocalFs is the supported path until then. |
| **Google OAuth credentials** | Google sign-in | Client id + secret. Email/password already works. |
| **Secrets stay private** | Every phase | Host env only. Never commit `.env`, never put a connection string in a PR body. Already true; do not regress. |

No gate blocks Phase 1, 2, or 3.

---

## 4. Stack invariants

These hold unless deliberately revisited and written down here and in
`CLAUDE.md`.

1. **Postgres with RLS is the security boundary.** Every tenant query goes
   through `withUser()`. `systemDb` / owner stays import-banned outside
   `scripts/`. `app_user` is non-superuser, non-`BYPASSRLS`, owns no tables.
   Never use `neondb_owner` as `DATABASE_URL`.

2. **Three connection strings, one database.** `DATABASE_URL` (app, pooled),
   `DATABASE_URL_OWNER` (migrations/seeds/webhooks, direct),
   `AUTH_DATABASE_URL` (Better Auth tables only, pooled). No hosted-platform
   SDK between the app and SQL. Neon is the hosted Postgres; it is not
   Supabase — do not add a Supabase client, Auth, or RLS helper.

3. **`booking_status_transition()` is the only writer of `status` and
   `payment_state`.** New flows add events, not new writers. Money columns
   are integer cents. The SD function re-derives price/fee from `packages` +
   `usage_rights_options` + `platform_config`.

4. **Never the word `escrow` in code.** `payment_state` / `funded`.

5. **No marketplace number is hard-coded in a component.** Fee bps live in
   `platform_config`. Env `PLATFORM_FEE_BPS` is UI estimate only.

6. **Theme the stage, never the rail.** Rail background is constant
   `#1C1710`. `src/components/rail/**` imports no theme module.

7. **Migrations** only via `scripts/migrate.ts` against the journal. No
   `drizzle-kit push` / `drizzle-kit migrate`.

8. **Quality gates that exist run in CI.** Local-only verification is not
   evidence after a change that those gates cover.

9. **Language.** No crypto/wallet/web3 branding. No personal names in
   `LICENSE`, README, UI, or git author (use `nsheinbe` noreply / "Spectacle
   contributors").

10. **Codename.** "Spectacle" is not the final public brand. Do not spend an
    active phase on the rename.

---

## 5. What is active

**Active now, in order:**

1. **Phase 1 — Design import (remaining).** No external dependency. This is
   the next implementation phase after the docs PR that adds this file.
2. **Phase 2 — Open rails, self-host, fee policy.** After Phase 1's stop
   condition. No external dependency.
3. **Phase 3 — Deliverable uploads and discovery.** After Phase 2.

**Scheduled but hard-gated (do not start):**

4. **Phase 4 — Stripe system edges.** Needs the Stripe and legal gates.

One phase at a time. One PR per phase. Hard stop when that phase's
acceptance tests pass. Do not scaffold a later phase "while you're here".

---

## 6. Parked

Not scheduled, not forgotten. Revisit only after the active phases close, or
when a gate listed in §3 clears and `PROGRESS.md` promotes the work.

- **Rename** off the Spectacle codename (trademark / SPECTACLES). Repo and
  `LICENSE` stay until then.
- **Solana or any crypto rail.** A means for a later fee-cut if it actually
  cuts fees and reaches a broad market — never the brand, never Phase 1–3.
- **Briefs marketplace** (`briefs` / `brief_responses` already in schema,
  zero grants). README's old Phase 3. Promote after Phase 3 closes.
- **Stub theme art direction** (`fooh`, `anamorphic`, `drone`, `street`).
  AA stubs are enough until a designer owns them.
- **Notifications** (email for proposal, payment, delivery).
- **Legal pages** (terms, privacy, usage-rights agreement) — blocked on the
  entity gate for anything binding.
- **Audit 2026-09-01 Tier 2** (`AUDIT.md`): PostCSS override, security
  headers/CSP, dedicated local-storage HMAC key, `BETTER_AUTH_SECRET` min 32,
  CI concurrency, major bumps.
- **Connect payouts / creator bank rails** beyond a single-platform charge.
- **Native apps, multi-currency, admin console.**

Nothing on this list blocks Phases 1–3.
