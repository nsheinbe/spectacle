import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/db/schema";

/**
 * Deterministic fixtures for verify-gates and the status-machine tests,
 * inserted as spectacle_owner (bypasses RLS as table owner — which is itself
 * part of what the suite proves). Owner-seeded bookings include states the
 * app cannot reach in Phase 1 (awaiting_payment beyond the enabled edges,
 * paid_out) because deny/allow probes need them as targets.
 */

const id = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const FX = {
  users: {
    brandA: id(1),
    brandB: id(2),
    creatorAOwner: id(3),
    creatorBOwner: id(4),
    unpubOwner: id(5),
    roleless: id(6), // auth user with NO profile row — role-selection probes
  },
  creators: {
    creatorA: id(11), // published
    creatorB: id(12), // published
    unpub: id(13), // unpublished — anon must never see it
  },
  packages: { pkgA: id(21), pkgB: id(22) },
  rights: { uroA: id(31), uroB: id(32) },
  portfolio: { itemA: id(41) },
  bookings: {
    bookingA: id(51), // brandA × creatorA, proposal
    bookingA2: id(52), // brandA × creatorA, inquiry — transition target
    bookingB: id(53), // brandB × creatorB, inquiry
    bookingPaid: id(54), // brandA × creatorA, paid_out (owner-seeded)
    bookingAwait: id(55), // brandA × creatorA, awaiting_payment
  },
  messages: { m1: id(61), m2: id(62) },
  deliverables: { d1: id(71) },
  slugs: { creatorA: "lumen-arc", creatorB: "volt-haus", unpub: "ghost-frame" },
  prices: { pkgA: 250_000, uroADelta: 50_000, pkgB: 180_000 },
} as const;

export async function seedFixtures(ownerUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: ownerUrl, max: 1 });
  const db = drizzle(pool, { schema });
  try {
    await db.insert(schema.user).values(
      (
        [
          [FX.users.brandA, "Brand A", "brand-a@example.com"],
          [FX.users.brandB, "Brand B", "brand-b@example.com"],
          [FX.users.creatorAOwner, "Creator A", "creator-a@example.com"],
          [FX.users.creatorBOwner, "Creator B", "creator-b@example.com"],
          [FX.users.unpubOwner, "Unpub Creator", "unpub@example.com"],
          [FX.users.roleless, "Roleless", "roleless@example.com"],
        ] as const
      ).map(([uid, name, email]) => ({ id: uid, name, email })),
    );

    await db.insert(schema.profiles).values([
      { id: FX.users.brandA, role: "brand", fullName: "Brand A", company: "Acme" },
      { id: FX.users.brandB, role: "brand", fullName: "Brand B", company: "Rival" },
      { id: FX.users.creatorAOwner, role: "creator", fullName: "Creator A" },
      { id: FX.users.creatorBOwner, role: "creator", fullName: "Creator B" },
      { id: FX.users.unpubOwner, role: "creator", fullName: "Unpub Creator" },
    ]);

    await db.insert(schema.creatorProfiles).values([
      {
        id: FX.creators.creatorA,
        userId: FX.users.creatorAOwner,
        slug: FX.slugs.creatorA,
        displayName: "Lumen Arc",
        bio: "Projection mapping across landmark facades.",
        location: "Berlin",
        theme: "projection",
        formats: ["projection"],
        published: true,
      },
      {
        id: FX.creators.creatorB,
        userId: FX.users.creatorBOwner,
        slug: FX.slugs.creatorB,
        displayName: "Volt Haus",
        bio: "FOOH and CGI spectacles.",
        location: "Lisbon",
        theme: "fooh",
        formats: ["fooh"],
        published: true,
      },
      {
        id: FX.creators.unpub,
        userId: FX.users.unpubOwner,
        slug: FX.slugs.unpub,
        displayName: "Ghost Frame",
        bio: "Not yet public.",
        published: false,
      },
    ]);

    await db.insert(schema.packages).values([
      {
        id: FX.packages.pkgA,
        creatorId: FX.creators.creatorA,
        name: "Landmark Projection Night",
        priceCents: FX.prices.pkgA,
      },
      {
        id: FX.packages.pkgB,
        creatorId: FX.creators.creatorB,
        name: "FOOH Flagship Spot",
        priceCents: FX.prices.pkgB,
      },
    ]);

    await db.insert(schema.usageRightsOptions).values([
      {
        id: FX.rights.uroA,
        creatorId: FX.creators.creatorA,
        name: "Organic social, 12 months",
        priceDeltaCents: FX.prices.uroADelta,
      },
      {
        id: FX.rights.uroB,
        creatorId: FX.creators.creatorB,
        name: "Organic social, 6 months",
        priceDeltaCents: 0,
      },
    ]);

    await db.insert(schema.portfolioItems).values([
      {
        id: FX.portfolio.itemA,
        creatorId: FX.creators.creatorA,
        title: "Opera House Takeover",
        mediaKey: "portfolio/" + FX.creators.creatorA + "/opera.jpg",
      },
    ]);

    const bookingBase = {
      brandId: FX.users.brandA,
      creatorId: FX.creators.creatorA,
      packageId: FX.packages.pkgA,
      usageRightsOptionId: FX.rights.uroA,
    };
    await db.insert(schema.bookings).values([
      {
        ...bookingBase,
        id: FX.bookings.bookingA,
        title: "Spring launch projection",
        brief: "North facade, one night.",
        status: "proposal",
        priceCents: 300_000,
        feeCents: 30_000,
      },
      {
        ...bookingBase,
        id: FX.bookings.bookingA2,
        title: "Summer teaser",
        brief: "TBD",
        status: "inquiry",
      },
      {
        id: FX.bookings.bookingB,
        brandId: FX.users.brandB,
        creatorId: FX.creators.creatorB,
        packageId: FX.packages.pkgB,
        usageRightsOptionId: FX.rights.uroB,
        title: "Rival flagship FOOH",
        brief: "Confidential brief for brand B.",
        status: "inquiry",
      },
      {
        ...bookingBase,
        id: FX.bookings.bookingPaid,
        title: "Completed engagement",
        status: "paid_out",
        paymentState: "paid_out",
        priceCents: 300_000,
        feeCents: 30_000,
      },
      {
        ...bookingBase,
        id: FX.bookings.bookingAwait,
        title: "Accepted proposal",
        status: "awaiting_payment",
        priceCents: 300_000,
        feeCents: 30_000,
      },
    ]);

    await db.insert(schema.messages).values([
      {
        id: FX.messages.m1,
        bookingId: FX.bookings.bookingA,
        senderId: FX.users.brandA,
        body: "Can we do two nights?",
      },
      {
        id: FX.messages.m2,
        bookingId: FX.bookings.bookingA,
        senderId: FX.users.creatorAOwner,
        body: "Yes — proposal updated.",
      },
    ]);

    await db.insert(schema.deliverables).values([
      {
        id: FX.deliverables.d1,
        bookingId: FX.bookings.bookingA,
        uploaderId: FX.users.creatorAOwner,
        storageKey: `deliverables/${FX.bookings.bookingA}/${FX.deliverables.d1}/final.mp4`,
        fileName: "final.mp4",
        mimeType: "video/mp4",
      },
    ]);

    await db.insert(schema.bookingEvents).values([
      {
        bookingId: FX.bookings.bookingA,
        actorId: FX.users.creatorAOwner,
        fromStatus: "inquiry",
        toStatus: "proposal",
        priceCentsSnapshot: 300_000,
        feeCentsSnapshot: 30_000,
      },
    ]);
  } finally {
    await pool.end();
  }
}
