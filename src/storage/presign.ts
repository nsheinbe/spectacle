import { sql } from "drizzle-orm";

import { withUser, type SessionIdentity } from "../db";
import { StorageForbiddenError, type StoragePort } from "./port";

export const DELIVERABLE_GET_TTL_SECONDS = 15 * 60;

export type ParticipantCheck = (
  session: SessionIdentity,
  bookingId: string,
) => Promise<boolean>;

/**
 * The real participant check. It restates the participant columns EXPLICITLY
 * instead of relying on bookings' SELECT policies to filter — so a widened
 * bookings policy (canary rows 1-2) does not silently widen presigning, and
 * the presign assertion stays independently canary-testable (row 7).
 */
export const isBookingParticipant: ParticipantCheck = async (
  session,
  bookingId,
) => {
  return withUser(session, async (tx) => {
    const result = await tx.execute(sql`
      SELECT 1
      FROM bookings b
      WHERE b.id = ${bookingId}
        AND (
          b.brand_id = app_uid()
          OR EXISTS (
            SELECT 1 FROM creator_profiles cp
            WHERE cp.id = b.creator_id AND cp.user_id = app_uid()
          )
        )
    `);
    return result.rows.length === 1;
  });
};

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DELIVERABLE_KEY_RE = new RegExp(`^deliverables/(${UUID_RE})/`);
const PORTFOLIO_KEY_RE = new RegExp(`^portfolio/(${UUID_RE})/`);
const AVATAR_KEY_RE = new RegExp(`^avatars/(${UUID_RE})$`);

/**
 * presignPut authorization, per key prefix, BEFORE any adapter call:
 *   deliverables/{bookingId}/… — creator participant of that booking
 *   portfolio/{creatorId}/…   — owning creator
 *   avatars/{userId}          — self
 * Any other shape is denied. Like isBookingParticipant, the predicates are
 * explicit column checks, independent of SELECT-policy widening.
 */
export async function authorizePutKey(
  session: SessionIdentity,
  key: string,
): Promise<boolean> {
  const deliverable = DELIVERABLE_KEY_RE.exec(key);
  if (deliverable) {
    const bookingId = deliverable[1];
    return withUser(session, async (tx) => {
      const result = await tx.execute(sql`
        SELECT 1
        FROM bookings b
        JOIN creator_profiles cp ON cp.id = b.creator_id
        WHERE b.id = ${bookingId} AND cp.user_id = app_uid()
      `);
      return result.rows.length === 1;
    });
  }
  const portfolio = PORTFOLIO_KEY_RE.exec(key);
  if (portfolio) {
    const creatorId = portfolio[1];
    return withUser(session, async (tx) => {
      const result = await tx.execute(sql`
        SELECT 1 FROM creator_profiles cp
        WHERE cp.id = ${creatorId} AND cp.user_id = app_uid()
      `);
      return result.rows.length === 1;
    });
  }
  const avatar = AVATAR_KEY_RE.exec(key);
  if (avatar) {
    return session.userId === avatar[1];
  }
  return false;
}

/**
 * The participant gate as a constructor seam: production wires the real
 * check (the default); verify-gates canary row 7 constructs a presigner with
 * a no-op check to prove `deliverable_presign_participant_only` goes RED.
 * There is deliberately NO env var and NO code switch that can weaken the
 * default — fault injection lives in the harness only.
 */
export function makeDeliverablePresigner({
  port,
  assertParticipant = isBookingParticipant,
}: {
  port: StoragePort;
  assertParticipant?: ParticipantCheck;
}) {
  return {
    async presignGet(
      session: SessionIdentity,
      bookingId: string,
      storageKey: string,
    ): Promise<string> {
      // Key must live under the booking's own prefix — a participant of one
      // booking can never mint a URL for another booking's key.
      if (!storageKey.startsWith(`deliverables/${bookingId}/`)) {
        throw new StorageForbiddenError();
      }
      if (!(await assertParticipant(session, bookingId))) {
        throw new StorageForbiddenError();
      }
      return port.presignGet({
        bucket: "deliverables",
        key: storageKey,
        expiresSeconds: DELIVERABLE_GET_TTL_SECONDS,
      });
    },
  };
}
