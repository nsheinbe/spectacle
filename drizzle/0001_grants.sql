-- 0001_grants — the full privilege matrix (see plan: every table × every role,
-- explicit columns). Runs as spectacle_owner via scripts/migrate.ts.
-- Roles are NEVER created here — scripts/bootstrap-roles.sql (superuser) runs
-- before the journaled chain. `—` in the plan matrix = no GRANT statement here.

-- Future functions are deny-by-default; each CREATE FUNCTION migration grants
-- EXECUTE explicitly in the same transaction.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint

-- ── auth infra → auth_user ONLY (app_user has zero grants here → 42501) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON "user" TO auth_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "session" TO auth_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "account" TO auth_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "verification" TO auth_user;
--> statement-breakpoint

-- ── domain → app_user ONLY (auth_user has zero grants here) ──
-- profiles: role/id have NO UPDATE grant (immutable after creation; the
-- INSERT policy additionally pins role IN ('brand','creator')).
GRANT SELECT, INSERT ON "profiles" TO app_user;
--> statement-breakpoint
GRANT UPDATE (full_name, company, avatar_url) ON "profiles" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "creator_profiles" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "packages" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "usage_rights_options" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "portfolio_items" TO app_user;
--> statement-breakpoint

-- bookings: BOTH write paths are column allowlists. status/payment_state are
-- un-insertable and un-updatable by app_user — they exist only via the schema
-- defaults ('inquiry'/'none') and the SECURITY DEFINER transition function.
-- (creator_id is in the INSERT list because the schema stores it denormalized
-- for the creator-arm SELECT policy; the server action derives it from the
-- package, and a forged value only mis-addresses the brand's own inquiry.)
GRANT SELECT ON "bookings" TO app_user;
--> statement-breakpoint
GRANT INSERT (brand_id, creator_id, package_id, usage_rights_option_id, title, brief, price_cents, fee_cents) ON "bookings" TO app_user;
--> statement-breakpoint
GRANT UPDATE (title, brief) ON "bookings" TO app_user;
--> statement-breakpoint

-- booking_events: SELECT only — the SD function (owner) is the sole writer.
GRANT SELECT ON "booking_events" TO app_user;
--> statement-breakpoint
-- append-only in Phase 1 (no UPDATE/DELETE)
GRANT SELECT, INSERT ON "deliverables" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT ON "messages" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT ON "reviews" TO app_user;
--> statement-breakpoint

-- platform_config: owner-only (SD function reads it). No grants.
-- webhook_events (P2), briefs / brief_responses (P3): no grants to anyone.

-- Belt-and-suspenders: booking_events must never gain wider privileges
-- silently; explicit revokes document intent even though no grant exists.
REVOKE UPDATE, DELETE, INSERT ON "booking_events" FROM app_user, auth_user;
--> statement-breakpoint
REVOKE ALL ON "platform_config" FROM app_user, auth_user;
