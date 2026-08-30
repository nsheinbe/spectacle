-- bootstrap-roles.sql — run ONCE by a privileged role BEFORE the journaled
-- migration chain (scripts/migrate.ts). Locally/CI: with-throwaway-db.ts runs
-- it as the initdb superuser. On Neon: run via psql as the project's default
-- role (see README — one-time step; Neon has no superuser, and nothing here
-- needs one: NO role gets BYPASSRLS or SUPERUSER, ever).
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
