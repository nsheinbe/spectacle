-- 0002_rls — GUC helpers, ENABLE ROW LEVEL SECURITY (never FORCE — the owner
-- bypasses RLS as table owner, the only shape provisionable on Neon), all
-- policies, and the security_invoker public view.
-- All GUC reads go through app_uid()/app_role(): on a pooled connection a
-- previously-set transaction-local GUC reverts to '' (empty string), NOT
-- NULL — NULLIF normalizes so anon is NULL everywhere and ::uuid never
-- raises 22P02 on reused connections.

CREATE FUNCTION app_uid() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_role() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.user_role', true), '') $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_uid() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_role() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_uid() TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_role() TO app_user;
--> statement-breakpoint

-- Participant predicate shared by messages/deliverables/booking_events
-- policies. Deliberately NOT SECURITY DEFINER: it runs as the caller, and it
-- restates the participant columns explicitly instead of leaning on bookings'
-- own SELECT policies — so widening a bookings SELECT policy (canary rows 1-2)
-- does NOT leak messages/events, keeping one-mutation-one-assertion true.
CREATE FUNCTION is_booking_participant(b_id uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = b_id
        AND (
          b.brand_id = public.app_uid()
          OR EXISTS (
            SELECT 1 FROM public.creator_profiles cp
            WHERE cp.id = b.creator_id AND cp.user_id = public.app_uid()
          )
        )
    )
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION is_booking_participant(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION is_booking_participant(uuid) TO app_user;
--> statement-breakpoint

-- ── ENABLE RLS everywhere (no FORCE) ──
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "creator_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "packages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "usage_rights_options" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "portfolio_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "deliverables" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_config" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "briefs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brief_responses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ── auth tables: permissive policy for auth_user (defense-in-depth; app_user
--    is locked out purely by having no grant → 42501) ──
CREATE POLICY auth_user_all ON "user" TO auth_user USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_session_all ON "session" TO auth_user USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_account_all ON "account" TO auth_user USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_verification_all ON "verification" TO auth_user USING (true) WITH CHECK (true);
--> statement-breakpoint

-- ── profiles ──
-- SELECT: own row; display fields of a published creator (backs the
-- security_invoker view); or the brand on a booking whose creator you own
-- (counterparty visibility — the workspace shows who you're talking to).
-- No recursion: creator_profiles/bookings SELECT policies never reference
-- profiles. The counterparty arm restates its columns explicitly, so
-- widening a bookings SELECT policy (canary rows 1-2) does not widen this.
CREATE POLICY profiles_sel ON "profiles" FOR SELECT TO app_user
  USING (
    id = app_uid()
    OR EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.user_id = profiles.id AND cp.published
    )
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.creator_profiles cp2 ON cp2.id = b.creator_id
      WHERE b.brand_id = profiles.id AND cp2.user_id = app_uid()
    )
  );
--> statement-breakpoint
-- INSERT: role pinned at creation — 'admin' is unassignable by any app path.
CREATE POLICY profiles_ins ON "profiles" FOR INSERT TO app_user
  WITH CHECK (id = app_uid() AND role IN ('brand', 'creator'));
--> statement-breakpoint
CREATE POLICY profiles_upd ON "profiles" FOR UPDATE TO app_user
  USING (id = app_uid()) WITH CHECK (id = app_uid());
--> statement-breakpoint

-- ── creator_profiles ──
CREATE POLICY creator_profiles_pub ON "creator_profiles" FOR SELECT TO app_user
  USING (published);
--> statement-breakpoint
CREATE POLICY creator_profiles_own_sel ON "creator_profiles" FOR SELECT TO app_user
  USING (user_id = app_uid());
--> statement-breakpoint
CREATE POLICY creator_profiles_ins ON "creator_profiles" FOR INSERT TO app_user
  WITH CHECK (user_id = app_uid());
--> statement-breakpoint
CREATE POLICY creator_profiles_upd ON "creator_profiles" FOR UPDATE TO app_user
  USING (user_id = app_uid()) WITH CHECK (user_id = app_uid());
--> statement-breakpoint
CREATE POLICY creator_profiles_del ON "creator_profiles" FOR DELETE TO app_user
  USING (user_id = app_uid());
--> statement-breakpoint

-- ── packages / usage_rights_options / portfolio_items ──
CREATE POLICY packages_pub ON "packages" FOR SELECT TO app_user
  USING (
    active AND EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = packages.creator_id AND cp.published
    )
  );
--> statement-breakpoint
CREATE POLICY packages_own ON "packages" TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = packages.creator_id AND cp.user_id = app_uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = packages.creator_id AND cp.user_id = app_uid()
    )
  );
--> statement-breakpoint
CREATE POLICY usage_rights_pub ON "usage_rights_options" FOR SELECT TO app_user
  USING (
    active AND EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = usage_rights_options.creator_id AND cp.published
    )
  );
--> statement-breakpoint
CREATE POLICY usage_rights_own ON "usage_rights_options" TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = usage_rights_options.creator_id AND cp.user_id = app_uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = usage_rights_options.creator_id AND cp.user_id = app_uid()
    )
  );
--> statement-breakpoint
CREATE POLICY portfolio_pub ON "portfolio_items" FOR SELECT TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = portfolio_items.creator_id AND cp.published
    )
  );
--> statement-breakpoint
CREATE POLICY portfolio_own ON "portfolio_items" TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = portfolio_items.creator_id AND cp.user_id = app_uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = portfolio_items.creator_id AND cp.user_id = app_uid()
    )
  );
--> statement-breakpoint

-- ── bookings ──
-- Two permissive SELECT policies so each tenant arm is independently
-- canary-testable (rows 1 and 2 of the mutation table).
CREATE POLICY bookings_sel_brand ON "bookings" FOR SELECT TO app_user
  USING (brand_id = app_uid());
--> statement-breakpoint
CREATE POLICY bookings_sel_creator ON "bookings" FOR SELECT TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = bookings.creator_id AND cp.user_id = app_uid()
    )
  );
--> statement-breakpoint
-- INSERT: belt-and-suspenders atop the column allowlist — even if the INSERT
-- grant is ever re-widened to table-wide (canary row 8), a booking cannot be
-- born in any state but inquiry/none.
CREATE POLICY bookings_ins_brand ON "bookings" FOR INSERT TO app_user
  WITH CHECK (
    brand_id = app_uid()
    AND status = 'inquiry'
    AND payment_state = 'none'
  );
--> statement-breakpoint
-- UPDATE: RLS admits the row; the GRANT UPDATE (title, brief) allowlist
-- independently caps columns — the layers are ANDed. Brand-only (title/brief
-- are brand-authored); brief freezes once the booking advances past proposal.
CREATE POLICY bookings_upd_brand ON "bookings" FOR UPDATE TO app_user
  USING (brand_id = app_uid() AND status IN ('inquiry', 'proposal'))
  WITH CHECK (brand_id = app_uid());
--> statement-breakpoint

-- ── messages ──
CREATE POLICY messages_sel ON "messages" FOR SELECT TO app_user
  USING (is_booking_participant(booking_id));
--> statement-breakpoint
-- sender_id pinned to the caller — cannot be forged.
CREATE POLICY messages_ins ON "messages" FOR INSERT TO app_user
  WITH CHECK (sender_id = app_uid() AND is_booking_participant(booking_id));
--> statement-breakpoint

-- ── deliverables ──
CREATE POLICY deliverables_sel ON "deliverables" FOR SELECT TO app_user
  USING (is_booking_participant(booking_id));
--> statement-breakpoint
CREATE POLICY deliverables_ins ON "deliverables" FOR INSERT TO app_user
  WITH CHECK (
    uploader_id = app_uid()
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.creator_profiles cp ON cp.id = b.creator_id
      WHERE b.id = deliverables.booking_id AND cp.user_id = app_uid()
    )
  );
--> statement-breakpoint

-- ── booking_events: participants read; nobody in app roles writes ──
CREATE POLICY booking_events_sel ON "booking_events" FOR SELECT TO app_user
  USING (is_booking_participant(booking_id));
--> statement-breakpoint

-- ── reviews ──
CREATE POLICY reviews_pub ON "reviews" FOR SELECT TO app_user
  USING (true);
--> statement-breakpoint
CREATE POLICY reviews_ins ON "reviews" FOR INSERT TO app_user
  WITH CHECK (
    brand_id = app_uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = reviews.booking_id
        AND b.brand_id = app_uid()
        AND b.creator_id = reviews.creator_id
        AND b.status = 'paid_out'
    )
  );
--> statement-breakpoint

-- platform_config / webhook_events / briefs / brief_responses: RLS enabled,
-- no policies, no grants — fully sealed to app roles.

-- ── public storefront view (security_invoker: caller's RLS applies) ──
CREATE VIEW public_creator_view WITH (security_invoker = true) AS
  SELECT
    cp.id,
    cp.user_id,
    cp.slug,
    cp.display_name,
    cp.bio,
    cp.location,
    cp.theme,
    cp.formats,
    p.avatar_url,
    p.full_name
  FROM public.creator_profiles cp
  JOIN public.profiles p ON p.id = cp.user_id
  WHERE cp.published;
--> statement-breakpoint
GRANT SELECT ON public_creator_view TO app_user;
