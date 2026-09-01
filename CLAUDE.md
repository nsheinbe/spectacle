# CLAUDE.md

Spectacle — a booking marketplace for spectacle advertising. Next.js 15 App
Router, Drizzle ORM over `node-postgres`, Better Auth, deployed on Vercel.

## Hosted stack

**The database is Neon Postgres** — project `spectacle`, PostgreSQL 17. It is not
Supabase: there is no Supabase client, no hosted Supabase Auth, and no Supabase
RLS helpers. Do not add any. A gate in `verify-gates` scans the runtime surface
and fails if one reappears. The runtime is a connection string, a driver, and SQL.

**Vercel**: project `spectacle` on team `nsheinbe-labs`. Environment variables are
already set on Production and Preview.

## Connection strings — three roles, one database

| variable | role | Neon host | used by |
| --- | --- | --- | --- |
| `DATABASE_URL` | `app_user` | pooled | all app traffic, under RLS |
| `DATABASE_URL_OWNER` | `spectacle_owner` | direct | migrations and seeds only |
| `AUTH_DATABASE_URL` | `auth_user` | pooled | Better Auth tables only |

`app_user` is non-superuser, non-`BYPASSRLS`, and owns no tables. `withUser()`
**fails closed** if `DATABASE_URL` turns out to name a privileged role
(`src/db/client.internal.ts`): every policy is enforced against that role, so a
privileged one would silently return every tenant's rows rather than erroring.

**Never use `neondb_owner` as `DATABASE_URL`.** It is Neon's default role — a
`neon_superuser` member with `BYPASSRLS` — and it is the string the Neon console
hands you.

Migrations use the **direct** host (`ep-…` with no `-pooler`): the migrator holds a
session-lifetime advisory lock and runs multi-statement DDL, neither of which
survives a transaction pooler.

## Auth

Better Auth. `AUTH_SECRET` is the 32+ byte secret — an alias of
`BETTER_AUTH_SECRET`, which wins if both are set. `BETTER_AUTH_URL` is only
required for a custom production domain; preview deploys fall back to the
Vercel-injected hostname.

## RLS

**On, and required.** Postgres RLS is free on Neon, so there is no reason to move
enforcement into application code. 28 policies plus column allowlists; `status`
and `payment_state` move only through the `SECURITY DEFINER`
`booking_status_transition()` function.

Every app query goes through `withUser()` in `src/db/rls.ts`, which sets the
identity GUCs transaction-locally. Do not bypass it — `systemDb` (the owner
connection) is import-banned outside `scripts/`, by ESLint and by a gate.

## Commands

```sh
pnpm verify:gates:canary   # 55 assertions + 17 fail-open canaries, throwaway PG17
pnpm verify:neon           # 10 assertions against live Neon; read-only, safe on prod
pnpm migrate               # journaled chain, needs DATABASE_URL_OWNER
pnpm neon:bootstrap        # one-time: create the three roles, print their URLs
```

`drizzle-kit push` and `drizzle-kit migrate` are forbidden; `scripts/migrate.ts` is
the only path that applies migrations, and a gate greps for violations.

See [README.md](README.md) for the full security model, the local-dev setup, and
the decision log.
