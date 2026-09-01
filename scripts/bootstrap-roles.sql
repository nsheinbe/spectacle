-- bootstrap-roles.sql — run ONCE by a privileged role BEFORE the journaled
-- migration chain (scripts/migrate.ts). Locally/CI: with-throwaway-db.ts runs
-- it as the initdb superuser. On Neon: `pnpm neon:bootstrap` runs it as the
-- project's default role (see README — one-time step; Neon has no superuser,
-- and nothing here needs one: NO role gets BYPASSRLS or SUPERUSER, ever).
--
-- Idempotent: safe to re-run. Passwords are set out-of-band per environment
-- (ALTER ROLE ... PASSWORD ...) and never committed.

DO $$ BEGIN
  CREATE ROLE spectacle_owner LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE ROLE app_user LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE ROLE auth_user LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- No role in this design has a legitimate temp-table need; revoking TEMP from
-- PUBLIC closes the pg_temp-shadowing vector for any future SECURITY DEFINER
-- function too (booking_status_transition additionally pins search_path).
-- Applies to the CURRENT database — re-run this file against the app database
-- after it exists (with-throwaway-db does; README documents it for Neon).
DO $$ BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END $$;

-- Schema rights. Locally spectacle_owner owns the database and therefore
-- already holds CREATE on public via pg_database_owner; on Neon the database
-- is owned by the project's default role, public is owned by
-- pg_database_owner, and PUBLIC holds USAGE but NOT CREATE (PG15+). Without
-- this grant the journaled chain cannot create a single table on Neon.
-- Granting rather than reassigning ownership keeps the two environments on
-- the same code path and leaves Neon's own role hierarchy untouched.
GRANT USAGE, CREATE ON SCHEMA public TO spectacle_owner;

-- CREATE on the *database* — the drizzle migrator opens by running
-- `CREATE SCHEMA IF NOT EXISTS "drizzle"` for its journal table, and the ACL
-- check precedes the IF NOT EXISTS short-circuit, so this is required on every
-- run and not just the first. Implicit locally (spectacle_owner owns the
-- database), absent on Neon (neondb is owned by the project's default role).
DO $$ BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO spectacle_owner', current_database());
END $$;

-- app_user/auth_user only ever read and write objects the owner created; they
-- never create their own. Explicit so the design does not silently depend on
-- public's default USAGE-to-PUBLIC grant surviving a future revoke.
GRANT USAGE ON SCHEMA public TO app_user, auth_user;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
