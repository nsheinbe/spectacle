import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FX, seedFixtures } from "../scripts/fixtures";
import { startThrowawayDb, type ThrowawayHandle } from "../scripts/with-throwaway-db";

/**
 * Exhaustive status-machine proof against the REAL SECURITY DEFINER function
 * on an ephemeral PG16: every (from → to) cell of the 10×10 grid, called as
 * brand AND creator, with the expected outcome derived from the TS mirror
 * (TRANSITION_MATRIX). If the TS mirror and the SQL matrix ever drift, a
 * cell's expectation stops matching and this suite fails.
 */

type TransitionModule = typeof import("../src/lib/bookings/transition");

const STATUSES = [
  "inquiry",
  "proposal",
  "awaiting_payment",
  "funded",
  "in_production",
  "delivered",
  "approved",
  "paid_out",
  "declined",
  "cancelled",
] as const;
type Status = (typeof STATUSES)[number];

let handle: ThrowawayHandle;
let ownerPool: Pool;
let mod: TransitionModule;

const brandSession = { userId: FX.users.brandA, role: "brand" as const };
const creatorSession = { userId: FX.users.creatorAOwner, role: "creator" as const };
const outsiderSession = { userId: FX.users.creatorBOwner, role: "creator" as const };

const BOOKING = FX.bookings.bookingA2;

async function setStatus(status: Status): Promise<void> {
  await ownerPool.query("update bookings set status = $1 where id = $2", [status, BOOKING]);
  await ownerPool.query("delete from booking_events where booking_id = $1", [BOOKING]);
}

beforeAll(async () => {
  handle = await startThrowawayDb();
  await seedFixtures(handle.db.ownerUrl);
  process.env.DATABASE_URL = handle.db.appUrl;
  process.env.DATABASE_URL_OWNER = handle.db.ownerUrl;
  process.env.AUTH_DATABASE_URL = handle.db.authUrl;
  ownerPool = new Pool({ connectionString: handle.db.ownerUrl, max: 1 });
  mod = await import("../src/lib/bookings/transition");
});

afterAll(async () => {
  await ownerPool?.end();
  const client = await import("../src/db/client.internal");
  await client._closeAppPool();
  await handle?.stop();
});

describe("every cell of the status grid, both parties", () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      for (const party of ["brand", "creator"] as const) {
        const edge = undefined as unknown; // placeholder for eslint scoping
        void edge;
        it(`${from} -> ${to} as ${party}`, async () => {
          const matrixEdge = mod.TRANSITION_MATRIX.find(
            (e) => e.from === from && e.to === to,
          );
          const session = party === "brand" ? brandSession : creatorSession;
          await setStatus(from);

          const expected: string | "success" = !matrixEdge
            ? "IllegalTransition"
            : matrixEdge.party === "system"
              ? "SystemOnly"
              : matrixEdge.party !== party
                ? "WrongParty"
                : matrixEdge.enabled
                  ? "success"
                  : "NotYetEnabled";

          if (expected === "success") {
            const result = await mod.transitionBooking(session, BOOKING, to);
            expect(result.status).toBe(to);
            const events = await ownerPool.query(
              "select to_status, actor_id from booking_events where booking_id = $1",
              [BOOKING],
            );
            expect(events.rowCount).toBe(1);
            expect(events.rows[0].to_status).toBe(to);
            expect(events.rows[0].actor_id).toBe(session.userId);
          } else {
            await expect(
              mod.transitionBooking(session, BOOKING, to),
            ).rejects.toMatchObject({ name: "BookingTransitionError", kind: expected });
            const events = await ownerPool.query(
              "select 1 from booking_events where booking_id = $1",
              [BOOKING],
            );
            expect(events.rowCount).toBe(0); // rejected calls append nothing
          }
        });
      }
    }
  }
});

describe("price re-derivation and access", () => {
  it("inquiry -> proposal re-derives price/fee from package + rights + platform_config", async () => {
    await setStatus("inquiry");
    await ownerPool.query(
      "update bookings set price_cents = 1, fee_cents = 999999 where id = $1",
      [BOOKING],
    );
    const result = await mod.transitionBooking(creatorSession, BOOKING, "proposal");
    expect(result.priceCents).toBe(FX.prices.pkgA + FX.prices.uroADelta);
    expect(result.feeCents).toBe(Math.floor((FX.prices.pkgA + FX.prices.uroADelta) * 0.1));
  });

  it("non-participants get Forbidden (no existence oracle)", async () => {
    await setStatus("inquiry");
    await expect(
      mod.transitionBooking(outsiderSession, BOOKING, "proposal"),
    ).rejects.toMatchObject({ kind: "Forbidden" });
    await expect(
      mod.transitionBooking(
        brandSession,
        "00000000-0000-4000-8000-999999999999",
        "proposal",
      ),
    ).rejects.toMatchObject({ kind: "Forbidden" });
  });

  it("TS mirror covers exactly the SQL matrix (13 edges, 2 enabled)", () => {
    expect(mod.TRANSITION_MATRIX).toHaveLength(13);
    expect(mod.TRANSITION_MATRIX.filter((e) => e.enabled)).toHaveLength(2);
    expect(mod.availableTransitions("inquiry", "creator")).toEqual([
      { to: "proposal", enabled: true },
      { to: "declined", enabled: false },
    ]);
    expect(mod.availableTransitions("proposal", "brand")).toEqual([
      { to: "awaiting_payment", enabled: true },
      { to: "declined", enabled: false },
    ]);
  });
});
