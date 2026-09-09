# Spectacle — progress

Living status file. **Update it in the same PR as the work it describes**,
when a box changes — not only at the end of a phase.

Plan, acceptance tests, and stop conditions live in
[`BUILD-PLAN.md`](BUILD-PLAN.md). This file only tracks state.

**Last updated:** 9 September 2026 · Phase 3 uploads + discovery on
`cursor/phase-3-uploads-discovery-11cc` against `main` @ `ecabddc`

---

## Now

BUILD-PLAN Phase 3 — deliverable uploads and discovery — is **done in this
PR**. A creator participant can upload a version in the booking workspace
through the existing presign port; the brand downloads via `presignGet`;
strangers get 403. `/browse` is a real list of published storefronts when
`FEATURE_BROWSE=true`, and still 404s when the flag is false (default
**false**). LocalFs remains the no-R2 path.

**Next implementation is parked / hard-gated — do not start it:**
[BUILD-PLAN Phase 4 — Stripe system edges](BUILD-PLAN.md#phase-4--stripe-system-edges-hard-gated).
Needs the Stripe account and legal-entity gates. `awaiting_payment→funded`
stays disabled.

---

## Phase board

| # | Phase | State | Stop condition met? |
| --- | --- | --- | --- |
| — | Marketplace foundation (README Phase 1) | **Done** on `main` @ `9cb5b50` | Yes — see inventory in BUILD-PLAN §1 |
| 1 | Design import (remaining) | **Done** on `main` @ `76c0f61` | Yes — four files are the running UI; copy is honest; existing gates still apply |
| 2 | Open rails, self-host, fee policy | **Done** on `main` @ `ecabddc` | Yes — self-host doc followed in CI; fee policy in the repo |
| 3 | Deliverable uploads and discovery | **Done — this PR** | Yes — workspace upload writes `deliverables`; `/browse` is flag-true UI |
| 4 | Stripe system edges | Scheduled — **hard-gated** | — |
| — | Briefs marketplace | Parked | — |
| — | Rename off "Spectacle" | Parked | — |
| — | Solana / crypto rails | Parked | — |

Promote a parked row only when the phase before it has met its stop condition
and its gates are open. Record the promotion here. Do not start Phase 4
before the Stripe and legal gates clear.

---

## Phase 1 checklist — Design import (remaining)

Mirrors [BUILD-PLAN Phase 1](BUILD-PLAN.md#phase-1--design-import-remaining).
UI source: `design/*.dc.html` (commit `b670fc8`) from live Design
<https://claude.ai/design/p/d2d84e31-7d1f-45fc-93ea-b653ea666460>
(Home, Booking Rail, Creator Storefront, Theme Contract).

- [x] Chrome + stage tokens from the live Design (`src/styles/tokens.css`, `d0e64e1`)
- [x] Tailwind semantic maps (`tailwind.config.ts`)
- [x] Rail stays constant `#1C1710` / no theme import from `src/components/rail/**`
- [x] `/` is the Home artboard — marketing homepage, no `/dashboard` redirect
- [x] `LAUNCH_COPY` — honest, no invented GMV/ratings (`src/lib/launch-copy.ts`)
- [x] Booking rail matches the Design file (not only the tokens)
- [x] Creator storefront matches the Design file
- [x] Theme Contract honoured in stage overrides
- [x] Codename stays; no fee-cut/crypto brand copy unless labeled an honest promise (prefer none)
- [x] `FEATURE_BROWSE` remains false; `/browse` 404s
- [x] `verify:themes` + existing CI still green

**Phase 1 closes when** the four Design files are the running UI and the
acceptance tests in the plan pass.

---

## Phase 2 checklist — Open rails, self-host, fee policy

Do not start until Phase 1 is marked done above.

- [x] Self-host path documented and followed once (app + PG17 + three roles + migrate + seed + start)
- [x] In-repo fee policy: ~18% cut framing, actual `fee_bps` (today **1000**), DB authoritative
- [x] Language rules applied (no crypto/wallet/web3 brand; no `escrow` in code)
- [x] Secrets still private — no `.env` or connection strings in git

**Phase 2 closes when** the self-host doc has been followed once and the fee
policy is in the repo.

---

## Phase 3 checklist — Deliverable uploads and discovery

Do not start until Phase 2 is marked done above.

- [x] Workspace upload writes a `deliverables` row through the existing presign port
- [x] Participant download via `presignGet`; stranger 403
- [x] `/browse` is a real page when `FEATURE_BROWSE=true`
- [x] `/browse` stays 404 when the flag is false (default false)
- [x] No `awaiting_payment→funded` in this phase

**Phase 3 closes when** one booking shows a real uploaded version and browse
is flag-true UI rather than a hard `notFound()`.

---

## Gate board

Statuses: `not started` → `in progress` → `open`. Stamp a date on every
transition.

| Gate | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Stripe account on a legal entity | not started | Phase 4 | Test-mode keys are not a start signal to *close* the phase |
| Legal entity + marketplace terms | not started | Phase 4; binding legal copy | Who is the counterparty; what `funded` means |
| Product name (not SPECTACLES) | not started | Public brand | Codename stays; parked |
| Live Design access | **open** for Phase 1 | Phase 1 polish | Four core files committed at `b670fc8` under `design/` |
| R2 credentials | not started | Proving R2 only | LocalFs is the supported path |
| Google OAuth credentials | not started | Google sign-in only | Email/password works |
| Secrets stay private | **open** (must not regress) | Every phase | `.gitignore` + host env. Do not put URLs in PRs |

---

## Decision log

Append-only. Date, what, why, what would reverse it.

| Date | Decision | Why | Reversal cost |
| --- | --- | --- | --- |
| 2026-08-30 | Marketplace Phase 1 on Next 15 + Better Auth + Drizzle + RLS | PR #1 — database is the trust boundary | High |
| 2026-09-01 | Neon three-role hosted path; no Supabase client | PR #2 / #3; fleet invariant | High |
| 2026-09-01 | Design import is tokens-first (`d0e64e1`) | Palette can land without pretending the UI matches | Low — Phase 1 finishes the rest |
| 2026-09-01 | Never `escrow` in code; `payment_state` / `funded` | README invariant; money language is legal-adjacent | High if identifiers ship |
| 2026-09-09 | Remaining work renumbered in BUILD-PLAN: Design → open rails → uploads/browse; Stripe gated; briefs/rename/crypto parked | Standing order: docs-only plan first; park entity/legal and crypto | Low before Phase 1 starts |
| 2026-09-09 | Plan-complete = Phases 1–3 only | Stripe must not quietly become required | Record in BUILD-PLAN if the operator wants money in the completion sentence |
| 2026-09-09 | Ship Home in Design `launchCopy` mode, then strip remaining untrue claims | Design Home invents GMV ($12.4M), ratings, reach, 4h reply, logo clients, identity/reach verification, briefs, browse, a legal entity, and payment-already-works copy. Invariant wins. | Low — restore a line only when it becomes true |
| 2026-09-09 | Hero wordmark is the codename SPECTACLE, not MERIDIAN | `heroWordmark` is a Design control, not a second brand | Low |
| 2026-09-09 | No `/browse`, no “Post a brief”, no “Find a creator” directory while those surfaces do not exist | `FEATURE_BROWSE` is false; briefs are parked | Low when Phase 3/briefs land |
| 2026-09-09 | Rail “Request booking” goes to `/book/[packageId]`; no fake 48-hour accept toast | The book flow is real; the Design toast is not | Low |
| 2026-09-09 | Projection stage tokens aligned to Theme Contract (`#16130F` / `#100D08` / `#F2EBDD` / `#FFB24D`) | Honour the contract without inventing stub-theme art direction (still parked) | Low |
| 2026-09-09 | Home + storefront beams are CSS custom properties + pointer, not a second rAF loop | verify-themes allows one declared rAF (projection signature); Design beam must still exist | Medium if a registered second loop is added |
| 2026-09-09 | Keep `platform_config.fee_bps` default **1000** | Phase 2 policy text; no product decision to change the take | Low — record here before changing the default |
| 2026-09-09 | `/browse` is real UI when `FEATURE_BROWSE=true`; default stays **false** | Phase 3 stop condition; no invented ratings/GMV; homepage/nav link only when the flag is on | Low — turn the flag on in host env when the operator wants a directory |

**Do not guess:**

| # | Question | Blocks |
| --- | --- | --- |
| 1 | Public product name | Rename (parked) |
| 2 | Whether to change `fee_bps` from 1000 | **Decided 2026-09-09: keep 1000.** Re-open only with a new decision-log row |
| 3 | Charge shape (platform MOR vs Connect) once an entity exists | Phase 4 |

---

## Changelog

| Date | Change |
| --- | --- |
| 2026-09-09 | `BUILD-PLAN.md` and `PROGRESS.md` added against `main` @ `9cb5b50`. Honest seed: marketplace+RLS done; Design tokens 1/n; `/` redirects to `/dashboard`; Apache-2.0 public; self-host + fee policy missing; next impl = BUILD-PLAN Phase 1. Docs only — no product code. |
| 2026-09-09 | Phase 1 Design import: `design/*.dc.html` at `b670fc8`; `/` is Home + `LAUNCH_COPY`; rail + `/c/[slug]` match the artboards; Theme Contract honoured; `FEATURE_BROWSE` still false. Honesty deviations logged above. |
| 2026-09-09 | Phase 2 open rails: `SELF-HOST.md` + `FEE-POLICY.md`; compose may run the app (`--profile app`); `pnpm verify:self-host` records bootstrap → migrate → seed → `next start` on throwaway PG17. `fee_bps` stays 1000. No Stripe. |
| 2026-09-09 | Phase 3 uploads + discovery: workspace creator PUT via existing presign port writes `deliverables`; participant `presignGet` / stranger 403; `/browse` lists published storefronts when `FEATURE_BROWSE=true` (default false). No Stripe. LocalFs remains the no-R2 path. |

---

## How to update this file

1. Tick a checklist box in the **same PR** as the work, even if the phase is
   not finished.
2. Move a gate's status and stamp the date.
3. Append the decision log when something is chosen — including defaults.
4. Add a changelog row.
5. When a phase's stop condition is met, mark it on the phase board and only
   then start the next active phase. Promote parked work here before
   scaffolding it.
