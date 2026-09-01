-- 0003_functions — the status trust boundary.
-- booking_status_transition is SECURITY DEFINER, owned by spectacle_owner
-- (bypasses RLS as table owner), with search_path PINNED (pg_temp explicitly
-- last) and every relation schema-qualified — a caller-created temp table can
-- never shadow bookings/booking_events. The REVOKE/GRANT pair lives in this
-- same migration/transaction as CREATE FUNCTION: there is no window where
-- PUBLIC holds EXECUTE.
--
-- Error taxonomy (mapped to typed TS errors in src/lib/bookings/transition.ts):
--   42501  SPECTACLE_FORBIDDEN        — anon GUC, unknown booking, or non-participant
--                                       (one message for the latter two: no existence oracle)
--   SP001  SPECTACLE_ILLEGAL_TRANSITION
--   SP002  SPECTACLE_WRONG_PARTY
--   SP003  SPECTACLE_NOT_YET_ENABLED  — valid edge, right party, later phase
--   SP004  SPECTACLE_SYSTEM_ONLY      — awaiting_payment→funded, approved→paid_out

INSERT INTO "platform_config" (id, fee_bps) VALUES (1, 1000) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

CREATE FUNCTION booking_status_transition(p_booking_id uuid, p_to booking_status)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid;
  v_booking public.bookings;
  v_creator_owner uuid;
  v_is_brand boolean;
  v_is_creator boolean;
  v_from public.booking_status;
  v_party text;      -- 'brand' | 'creator' | 'system'
  v_enabled boolean; -- Phase 1 gating
  v_price integer;
  v_fee integer;
  v_fee_bps integer;
BEGIN
  v_uid := public.app_uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'SPECTACLE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SPECTACLE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT cp.user_id INTO v_creator_owner
  FROM public.creator_profiles cp WHERE cp.id = v_booking.creator_id;

  v_is_brand := (v_booking.brand_id = v_uid);
  v_is_creator := (v_creator_owner = v_uid);
  IF NOT (v_is_brand OR v_is_creator) THEN
    RAISE EXCEPTION 'SPECTACLE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_from := v_booking.status;

  -- The authoritative matrix. Full matrix implemented now; only two edges are
  -- enabled in Phase 1. system edges reject ALL app callers, always.
  CASE v_from::text || '->' || p_to::text
    WHEN 'inquiry->proposal'          THEN v_party := 'creator'; v_enabled := true;
    WHEN 'inquiry->declined'          THEN v_party := 'creator'; v_enabled := false;
    WHEN 'inquiry->cancelled'         THEN v_party := 'brand';   v_enabled := false;
    WHEN 'proposal->awaiting_payment' THEN v_party := 'brand';   v_enabled := true;
    WHEN 'proposal->declined'         THEN v_party := 'brand';   v_enabled := false;
    WHEN 'proposal->cancelled'        THEN v_party := 'creator'; v_enabled := false;
    WHEN 'awaiting_payment->funded'   THEN v_party := 'system';  v_enabled := false;
    WHEN 'awaiting_payment->cancelled' THEN v_party := 'brand';  v_enabled := false;
    WHEN 'funded->in_production'      THEN v_party := 'creator'; v_enabled := false;
    WHEN 'in_production->delivered'   THEN v_party := 'creator'; v_enabled := false;
    WHEN 'delivered->approved'        THEN v_party := 'brand';   v_enabled := false;
    WHEN 'delivered->in_production'   THEN v_party := 'brand';   v_enabled := false;
    WHEN 'approved->paid_out'         THEN v_party := 'system';  v_enabled := false;
    ELSE
      RAISE EXCEPTION 'SPECTACLE_ILLEGAL_TRANSITION: % -> %', v_from, p_to
        USING ERRCODE = 'SP001';
  END CASE;

  IF v_party = 'system' THEN
    RAISE EXCEPTION 'SPECTACLE_SYSTEM_ONLY: % -> %', v_from, p_to
      USING ERRCODE = 'SP004';
  END IF;

  IF (v_party = 'creator' AND NOT v_is_creator)
     OR (v_party = 'brand' AND NOT v_is_brand) THEN
    RAISE EXCEPTION 'SPECTACLE_WRONG_PARTY: % may not take % -> %',
      CASE WHEN v_is_brand THEN 'brand' ELSE 'creator' END, v_from, p_to
      USING ERRCODE = 'SP002';
  END IF;

  IF NOT v_enabled THEN
    RAISE EXCEPTION 'SPECTACLE_NOT_YET_ENABLED: % -> %', v_from, p_to
      USING ERRCODE = 'SP003';
  END IF;

  -- Authoritative price re-derivation at inquiry→proposal: whatever the
  -- insert claimed is overwritten from packages + usage_rights_options and
  -- platform_config before any state that matters.
  IF v_from = 'inquiry' AND p_to = 'proposal' THEN
    SELECT pk.price_cents + uro.price_delta_cents INTO STRICT v_price
    FROM public.packages pk, public.usage_rights_options uro
    WHERE pk.id = v_booking.package_id
      AND uro.id = v_booking.usage_rights_option_id;
    SELECT fee_bps INTO STRICT v_fee_bps FROM public.platform_config WHERE id = 1;
    v_fee := (v_price::bigint * v_fee_bps / 10000)::integer;
  ELSE
    v_price := v_booking.price_cents;
    v_fee := v_booking.fee_cents;
  END IF;

  UPDATE public.bookings
  SET status = p_to, price_cents = v_price, fee_cents = v_fee, updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_events
    (booking_id, actor_id, from_status, to_status, price_cents_snapshot, fee_cents_snapshot)
  VALUES
    (p_booking_id, v_uid, v_from, p_to, v_price, v_fee);

  RETURN v_booking;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION booking_status_transition(uuid, booking_status) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION booking_status_transition(uuid, booking_status) TO app_user;
