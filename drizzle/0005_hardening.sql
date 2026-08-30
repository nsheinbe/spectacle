-- 0005_hardening — post-audit fixes (see README decision log).
--
-- (1) Storefront deletion is closed off for Phase 1. FK cascades run as the
-- table owner and bypass RLS entirely, so a single permitted DELETE on
-- creator_profiles used to cascade-wipe counterparty bookings, messages and
-- the append-only booking_events audit trail. 0004 re-pointed the history
-- FKs (bookings.brand_id, bookings.creator_id, reviews.creator_id) to
-- ON DELETE RESTRICT; here the app-side path is removed too — no Phase 1
-- flow deletes a storefront, unpublish is the supported off-switch. This
-- also blocks the auth-side chain (user -> profiles -> creator_profiles)
-- from destroying booking history if account deletion ever ships.
REVOKE DELETE ON "creator_profiles" FROM app_user;
--> statement-breakpoint
DROP POLICY "creator_profiles_del" ON "creator_profiles";
--> statement-breakpoint

-- (2) bookings.updated_at is stamped by a trigger so the app_user title/brief
-- edit path (column allowlist: title, brief only — updated_at deliberately
-- NOT grantable) still bumps recency for list ordering. BEFORE UPDATE
-- trigger assignment is not subject to column privileges.
CREATE FUNCTION set_bookings_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON "bookings"
  FOR EACH ROW
  EXECUTE FUNCTION set_bookings_updated_at();
