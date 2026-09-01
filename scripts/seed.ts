import { eq, sql } from "drizzle-orm";

/**
 * Dev seed — runs through the REAL app paths wherever possible: users via
 * Better Auth's server API (as auth_user), profiles/storefronts/packages via
 * withUser under RLS (as app_user), and status moves via the SECURITY
 * DEFINER function. If the seed can do it, the app can.
 *
 * Prereqs: roles bootstrapped, database migrated (see README quick start).
 * Idempotent-ish: personas that already exist are skipped.
 */

const PASSWORD = "spectacle-demo-1!";

type CreatorSpec = {
  email: string;
  name: string;
  slug: string;
  displayName: string;
  bio: string;
  location: string;
  theme: "projection" | "fooh" | "anamorphic" | "drone" | "street";
  formats: Array<"projection" | "fooh" | "anamorphic" | "drone" | "street">;
  packages: Array<{
    name: string;
    description: string;
    priceDollars: number;
    turnaroundDays: number;
    deliverableSummary: string;
  }>;
  rights: Array<{ name: string; description: string; deltaDollars: number }>;
  portfolio: string[];
};

const CREATORS: CreatorSpec[] = [
  {
    email: "lumen@spectacle.test",
    name: "Mara Voss",
    slug: "lumen-arc",
    displayName: "Lumen Arc",
    bio: "Projection mapping across landmark facades — opera houses, silos, cathedrals. We turn architecture into narrative.",
    location: "Berlin",
    theme: "projection",
    formats: ["projection"],
    packages: [
      {
        name: "Landmark Projection Night",
        description:
          "One night, one facade. Site scouting, permissions support, custom 3D-mapped content, live capture crew.",
        priceDollars: 2500,
        turnaroundDays: 21,
        deliverableSummary: "1 night, 1 facade, capture film + stills",
      },
      {
        name: "Weekend Takeover",
        description: "Three consecutive nights with evolving content and audience capture.",
        priceDollars: 5400,
        turnaroundDays: 30,
        deliverableSummary: "3 nights, full capture package",
      },
    ],
    rights: [
      { name: "Organic social, 12 months", description: "Your channels, worldwide, 12 months.", deltaDollars: 500 },
      { name: "Paid media, 6 months", description: "Paid placements incl. cutdowns, 6 months.", deltaDollars: 1400 },
    ],
    portfolio: ["Opera House Takeover", "Grain Silo Cinema", "Cathedral of Light"],
  },
  {
    email: "volt@spectacle.test",
    name: "Rui Almeida",
    slug: "volt-haus",
    displayName: "Volt Haus",
    bio: "FOOH & CGI spectacles engineered to stop thumbs. Photoreal impossible moments on real streets.",
    location: "Lisbon",
    theme: "fooh",
    formats: ["fooh"],
    packages: [
      {
        name: "FOOH Flagship Spot",
        description: "One photoreal fake-out-of-home film built on real plates from your city.",
        priceDollars: 1800,
        turnaroundDays: 14,
        deliverableSummary: "1 hero film, 9:16 + 1:1 cutdowns",
      },
    ],
    rights: [
      { name: "Organic social, 6 months", description: "Your channels, 6 months.", deltaDollars: 0 },
      { name: "All media, 12 months", description: "Organic + paid, 12 months.", deltaDollars: 900 },
    ],
    portfolio: ["Tram Wrapped in Silk", "Monument Sneaker Drop"],
  },
  {
    email: "gilded@spectacle.test",
    name: "June Park",
    slug: "gilded-frame",
    displayName: "Gilded Frame",
    bio: "Anamorphic billboard illusions for screens that deserve better than static.",
    location: "Seoul",
    theme: "anamorphic",
    formats: ["anamorphic", "fooh"],
    packages: [
      {
        name: "Corner-Screen Illusion",
        description: "A bespoke anamorphic piece for a named corner LED, with screen-owner liaison.",
        priceDollars: 3200,
        turnaroundDays: 28,
        deliverableSummary: "1 anamorphic master + capture film",
      },
    ],
    rights: [
      { name: "Screen + social, 3 months", description: "The screen run plus your channels.", deltaDollars: 300 },
    ],
    portfolio: ["Wave Tank", "Falling Vault"],
  },
  {
    email: "swarm@spectacle.test",
    name: "Ada Okafor",
    slug: "night-swarm",
    displayName: "Night Swarm",
    bio: "Drone light shows: 300 to 1000 synchronized drones writing your story on the sky.",
    location: "Austin",
    theme: "drone",
    formats: ["drone"],
    packages: [
      {
        name: "300-Drone Reveal",
        description: "A 10-minute choreographed reveal show with licensed airspace and safety crew.",
        priceDollars: 9800,
        turnaroundDays: 45,
        deliverableSummary: "10-min show + aerial capture film",
      },
    ],
    rights: [
      { name: "Event + social, 12 months", description: "Live audience plus your channels.", deltaDollars: 1200 },
    ],
    portfolio: ["Lakefront Product Reveal", "Stadium Opener"],
  },
];

const BRANDS = [
  { email: "aurora@spectacle.test", name: "Iris Chen", company: "Aurora Beverages" },
  { email: "koda@spectacle.test", name: "Sam Reyes", company: "Koda Footwear" },
];

async function main(): Promise<void> {
  const [{ getAuth }, { _authDb }, dbmod, schema, { transitionBooking }] =
    await Promise.all([
      import("../src/lib/auth/auth"),
      import("../src/db/auth-db"),
      import("../src/db"),
      import("../src/db/schema"),
      import("../src/lib/bookings/transition"),
    ]);
  const { withUser } = dbmod;
  const auth = getAuth();

  async function ensureUser(email: string, name: string): Promise<string> {
    const [existing] = await _authDb()
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email));
    if (existing) return existing.id;
    const res = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name },
    });
    if (!res.user) throw new Error(`signup failed for ${email}`);
    return res.user.id;
  }

  async function stampRole(userId: string, role: "brand" | "creator"): Promise<void> {
    await _authDb().update(schema.user).set({ role }).where(eq(schema.user.id, userId));
  }

  const creatorIds: Record<string, { userId: string; creatorId: string; pkgIds: string[]; rightsIds: string[] }> = {};

  for (const spec of CREATORS) {
    const userId = await ensureUser(spec.email, spec.name);
    await withUser({ userId, role: "creator" }, async (tx) => {
      const [profile] = await tx
        .select({ id: schema.profiles.id })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, userId));
      if (!profile) {
        await tx.insert(schema.profiles).values({ id: userId, role: "creator", fullName: spec.name });
      }
    });
    await stampRole(userId, "creator");

    const result = await withUser({ userId, role: "creator" }, async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.creatorProfiles)
        .where(eq(schema.creatorProfiles.userId, userId));
      if (existing) {
        const pkgs = await tx
          .select({ id: schema.packages.id })
          .from(schema.packages)
          .where(eq(schema.packages.creatorId, existing.id));
        const rights = await tx
          .select({ id: schema.usageRightsOptions.id })
          .from(schema.usageRightsOptions)
          .where(eq(schema.usageRightsOptions.creatorId, existing.id));
        return { creatorId: existing.id, pkgIds: pkgs.map((p) => p.id), rightsIds: rights.map((r) => r.id) };
      }
      const [created] = await tx
        .insert(schema.creatorProfiles)
        .values({
          userId,
          slug: spec.slug,
          displayName: spec.displayName,
          bio: spec.bio,
          location: spec.location,
          theme: spec.theme,
          formats: spec.formats,
          published: true,
        })
        .returning({ id: schema.creatorProfiles.id });
      const creatorId = created!.id;
      const pkgIds: string[] = [];
      for (const [i, p] of spec.packages.entries()) {
        const [pkg] = await tx
          .insert(schema.packages)
          .values({
            creatorId,
            name: p.name,
            description: p.description,
            priceCents: p.priceDollars * 100,
            turnaroundDays: p.turnaroundDays,
            deliverableSummary: p.deliverableSummary,
            sort: i,
          })
          .returning({ id: schema.packages.id });
        pkgIds.push(pkg!.id);
      }
      const rightsIds: string[] = [];
      for (const [i, r] of spec.rights.entries()) {
        const [row] = await tx
          .insert(schema.usageRightsOptions)
          .values({
            creatorId,
            name: r.name,
            description: r.description,
            priceDeltaCents: r.deltaDollars * 100,
            sort: i,
          })
          .returning({ id: schema.usageRightsOptions.id });
        rightsIds.push(row!.id);
      }
      for (const [i, title] of spec.portfolio.entries()) {
        await tx.insert(schema.portfolioItems).values({
          creatorId,
          title,
          mediaKey: `portfolio/${creatorId}/${i}.jpg`,
          sort: i,
        });
      }
      return { creatorId, pkgIds, rightsIds };
    });
    creatorIds[spec.slug] = { userId, ...result };
    console.log(`creator ready: ${spec.displayName} (/c/${spec.slug})`);
  }

  const brandIds: string[] = [];
  for (const spec of BRANDS) {
    const userId = await ensureUser(spec.email, spec.name);
    await withUser({ userId, role: "brand" }, async (tx) => {
      const [profile] = await tx
        .select({ id: schema.profiles.id })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, userId));
      if (!profile) {
        await tx.insert(schema.profiles).values({
          id: userId,
          role: "brand",
          fullName: spec.name,
          company: spec.company,
        });
      }
    });
    await stampRole(userId, "brand");
    brandIds.push(userId);
    console.log(`brand ready: ${spec.company}`);
  }

  // Two demo bookings through the real paths: one stays at inquiry, one is
  // moved to proposal BY THE CREATOR via the SD function.
  const lumen = creatorIds["lumen-arc"]!;
  const volt = creatorIds["volt-haus"]!;
  const [auroraId, kodaId] = [brandIds[0]!, brandIds[1]!];

  const existingBookings = await withUser({ userId: auroraId, role: "brand" }, (tx) =>
    tx.select({ id: schema.bookings.id }).from(schema.bookings),
  );
  if (existingBookings.length === 0) {
    // Raw SQL: drizzle's insert() names every column, which trips the
    // bookings column-level INSERT allowlist (see createBookingAction).
    const insertBooking = (b: {
      brandId: string;
      creatorId: string;
      packageId: string;
      usageRightsOptionId: string;
      title: string;
      brief: string;
    }) =>
      withUser({ userId: b.brandId, role: "brand" }, async (tx) => {
        const created = await tx.execute(sql`
          insert into bookings
            (brand_id, creator_id, package_id, usage_rights_option_id, title, brief, price_cents, fee_cents)
          values
            (${b.brandId}, ${b.creatorId}, ${b.packageId}, ${b.usageRightsOptionId}, ${b.title}, ${b.brief}, 0, 0)
          returning id
        `);
        return (created.rows[0] as { id: string }).id;
      });

    const inquiryId = await insertBooking({
      brandId: auroraId,
      creatorId: lumen.creatorId,
      packageId: lumen.pkgIds[0]!,
      usageRightsOptionId: lumen.rightsIds[0]!,
      title: "Aurora summer launch facade",
      brief: "North-facing facade, first week of July, product silhouette reveal at the finale.",
    });
    await transitionBooking({ userId: lumen.userId, role: "creator" }, inquiryId, "proposal");
    await withUser({ userId: auroraId, role: "brand" }, async (tx) => {
      await tx.insert(schema.messages).values({
        bookingId: inquiryId,
        senderId: auroraId,
        body: "Love the proposal — checking dates with our events team.",
      });
    });
    console.log(`booking at proposal: ${inquiryId}`);

    await insertBooking({
      brandId: kodaId,
      creatorId: volt.creatorId,
      packageId: volt.pkgIds[0]!,
      usageRightsOptionId: volt.rightsIds[0]!,
      title: "Koda drop-day FOOH",
      brief: "Sneaker drop teaser on a landmark tram line.",
    });
    console.log("booking at inquiry created");
  } else {
    console.log("bookings already seeded — skipped");
  }

  console.log(`\nAll demo accounts use password: ${PASSWORD}`);
  console.log("Creators: lumen@ volt@ gilded@ swarm@spectacle.test");
  console.log("Brands:   aurora@ koda@spectacle.test");

  const { _closeAppPool } = await import("../src/db/client.internal");
  const { _closeAuthPool } = await import("../src/db/auth-db");
  await Promise.allSettled([_closeAppPool(), _closeAuthPool()]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
