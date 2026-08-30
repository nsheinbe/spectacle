import { sql } from "drizzle-orm";

import {
  withUser,
  type BookingStatus,
  type PaymentState,
  type SessionIdentity,
} from "../../db";

/**
 * TS mirror of the SQL status machine — for UX only (which buttons render,
 * which errors read how). THE SQL FUNCTION IS THE ENFORCEMENT: this table
 * must stay byte-for-byte in sync with booking_status_transition (the
 * status-machine test suite derives its expectations from this mirror and
 * runs every cell against the real function, so drift fails CI).
 */
export type TransitionParty = "brand" | "creator" | "system";

export const TRANSITION_MATRIX: ReadonlyArray<{
  from: BookingStatus;
  to: BookingStatus;
  party: TransitionParty;
  /** Phase 1 gating — disabled edges raise NOT_YET_ENABLED for the right party */
  enabled: boolean;
}> = [
  { from: "inquiry", to: "proposal", party: "creator", enabled: true },
  { from: "inquiry", to: "declined", party: "creator", enabled: false },
  { from: "inquiry", to: "cancelled", party: "brand", enabled: false },
  { from: "proposal", to: "awaiting_payment", party: "brand", enabled: true },
  { from: "proposal", to: "declined", party: "brand", enabled: false },
  { from: "proposal", to: "cancelled", party: "creator", enabled: false },
  { from: "awaiting_payment", to: "funded", party: "system", enabled: false },
  { from: "awaiting_payment", to: "cancelled", party: "brand", enabled: false },
  { from: "funded", to: "in_production", party: "creator", enabled: false },
  { from: "in_production", to: "delivered", party: "creator", enabled: false },
  { from: "delivered", to: "approved", party: "brand", enabled: false },
  { from: "delivered", to: "in_production", party: "brand", enabled: false },
  { from: "approved", to: "paid_out", party: "system", enabled: false },
];

export type TransitionErrorKind =
  | "IllegalTransition"
  | "WrongParty"
  | "NotYetEnabled"
  | "SystemOnly"
  | "Forbidden";

const SQLSTATE_TO_KIND: Record<string, TransitionErrorKind> = {
  SP001: "IllegalTransition",
  SP002: "WrongParty",
  SP003: "NotYetEnabled",
  SP004: "SystemOnly",
  "42501": "Forbidden",
};

export class BookingTransitionError extends Error {
  readonly kind: TransitionErrorKind;
  constructor(kind: TransitionErrorKind, message: string) {
    super(message);
    this.name = "BookingTransitionError";
    this.kind = kind;
  }
}

/** Human copy for toasts — never a crash. */
export const TRANSITION_ERROR_COPY: Record<TransitionErrorKind, string> = {
  IllegalTransition: "That move isn't part of the booking flow.",
  WrongParty: "Only the other party can take this step.",
  NotYetEnabled: "This step arrives in a later phase.",
  SystemOnly: "This step happens automatically once payments exist.",
  Forbidden: "You don't have access to this booking.",
};

export type TransitionResult = {
  id: string;
  status: BookingStatus;
  paymentState: PaymentState;
  priceCents: number;
  feeCents: number;
};

/** Buttons the UI may render for a booking at `status` seen by `party`. */
export function availableTransitions(
  status: BookingStatus,
  party: "brand" | "creator",
): Array<{ to: BookingStatus; enabled: boolean }> {
  return TRANSITION_MATRIX.filter(
    (e) => e.from === status && e.party === party,
  ).map((e) => ({ to: e.to, enabled: e.enabled }));
}

export async function transitionBooking(
  session: SessionIdentity,
  bookingId: string,
  to: BookingStatus,
): Promise<TransitionResult> {
  try {
    return await withUser(session, async (tx) => {
      const result = await tx.execute(sql`
        select id, status, payment_state, price_cents, fee_cents
        from booking_status_transition(${bookingId}, ${to}::booking_status)
      `);
      const row = result.rows[0] as {
        id: string;
        status: BookingStatus;
        payment_state: PaymentState;
        price_cents: number;
        fee_cents: number;
      };
      return {
        id: row.id,
        status: row.status,
        paymentState: row.payment_state,
        priceCents: row.price_cents,
        feeCents: row.fee_cents,
      };
    });
  } catch (err) {
    // drizzle wraps driver errors (DrizzleQueryError); the SQLSTATE is on the cause
    const e = err as { code?: string; cause?: { code?: string } };
    const code = e?.code ?? e?.cause?.code;
    const kind = code ? SQLSTATE_TO_KIND[code] : undefined;
    if (kind) {
      throw new BookingTransitionError(kind, TRANSITION_ERROR_COPY[kind]);
    }
    throw err;
  }
}
