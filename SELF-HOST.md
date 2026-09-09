# Self-host

One documented way to run Spectacle on a single machine: Postgres 17, the
three roles, journaled migrate, seed, and `next start`. No Vercel. No Neon.

Secrets stay in `.env` (gitignored). There is no fourth application
connection string. There are no `NEXT_PUBLIC_` paid keys.

CI follows this same sequence — bootstrap, migrate, seed, `next start` —
against a throwaway PG17 cluster via `pnpm verify:self-host`.

## Prerequisites

- Node 22
- pnpm 10
- Docker, **or** any PostgreSQL 17 server that accepts a superuser connection

## Host-run app (documented path)

The app runs on the host; Postgres runs in Compose (or any local 17).

```sh
pnpm install
pnpm self-host:init-env          # writes .env if missing; never overwrites
docker compose up -d db          # or point POSTGRES_ADMIN_URL at your PG17
pnpm self-host:bootstrap         # three roles + database + passwords
pnpm migrate
pnpm seed
pnpm build
pnpm start
```

`migrate`, `seed`, and `self-host:bootstrap` load unset keys from `.env`.
`next start` does the same.

If `db` was already created with a different `POSTGRES_PASSWORD`, either
put that password in `.env` or run `docker compose down -v` (destroys
data) and start again. Compose reads `.env` for interpolation — that is
why init-env runs first.

Then, from the same machine:

| Check | What you should see |
| --- | --- |
| `curl -s http://localhost:3000/api/health` | `{"ok":true}` |
| Sign in at `/auth` | Email `aurora@spectacle.test`, password `spectacle-demo-1!` |
| Open `/c/lumen-arc` | Seeded storefront **Lumen Arc** |
| Open `/dashboard` after sign-in | Brand dashboard with **Aurora summer launch facade** |

All demo accounts share that password (printed again by `pnpm seed`).
Creators: `lumen@`, `volt@`, `gilded@`, `swarm@spectacle.test`.
Brands: `aurora@`, `koda@spectacle.test`.

## Compose runs the app too

After `.env` exists (from `pnpm self-host:init-env`):

```sh
docker compose --profile app up --build
```

The `app` service bootstraps roles, migrates, seeds, and serves on port
3000. Compose builds the three connection strings for host `db`; do not
paste hosted URLs into the container.

`docker compose up -d db` stays the database-only command used by the
README quick start.

## What bootstrap does

`pnpm self-host:bootstrap` is the local counterpart of `pnpm neon:bootstrap`:

1. Connects as the Postgres superuser (`POSTGRES_ADMIN_URL`, or
   `postgres://postgres:$POSTGRES_PASSWORD@127.0.0.1:5432/postgres`).
2. Applies `scripts/bootstrap-roles.sql` (creates `spectacle_owner`,
   `app_user`, `auth_user`; no `BYPASSRLS`, no superuser).
3. Creates database `spectacle` owned by `spectacle_owner` if needed.
4. Re-applies the bootstrap file on that database (TEMP revoke is
   per-database).
5. Sets role passwords from the environment, or generates them.
6. Prints the three connection strings once. Put them in `.env` if
   init-env did not already.

That admin URL is bootstrap-only. The running app still uses exactly
`DATABASE_URL`, `DATABASE_URL_OWNER`, and `AUTH_DATABASE_URL`.

## Fee

The live take is `platform_config.fee_bps` in the database, default
**1000** (10% of the booking). `PLATFORM_FEE_BPS` is a display estimate.
See [FEE-POLICY.md](FEE-POLICY.md).

## Storage and sign-in extras

Absent R2 variables, LocalFs is the supported store. Google sign-in is
optional and off until `GOOGLE_CLIENT_ID` is set. Neither is required to
hit health, sign in with a seed account, or open a seeded storefront.
