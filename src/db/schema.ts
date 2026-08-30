import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ────────────────────────────── enums ────────────────────────────── */

export const userRoleEnum = pgEnum("user_role", ["brand", "creator", "admin"]);

export const themeEnum = pgEnum("theme", [
  "projection",
  "fooh",
  "anamorphic",
  "drone",
  "street",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
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
]);

export const paymentStateEnum = pgEnum("payment_state", [
  "none",
  "funded",
  "refunded",
  "paid_out",
]);

export const FORMATS = [
  "projection",
  "fooh",
  "anamorphic",
  "drone",
  "street",
] as const;
export type Format = (typeof FORMATS)[number];

/* ─────────────── Better Auth infra tables (auth_user only) ───────────────
 * Shape mirrors `npx @better-auth/cli generate` output for the drizzle
 * adapter (checked into schema.ts once — Better Auth's own migrator never
 * runs; auth_user cannot CREATE TABLE). `role` is the additionalField the
 * role-selection action stamps via auth.api.updateUser. ids are uuid —
 * Better Auth is configured with generateId: crypto.randomUUID.
 */

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ───────────────────────── domain tables (app_user) ───────────────────────── */

/**
 * RLS-protected mirror of the auth user. id EQUALS user.id (no default —
 * the role-selection action inserts it as app_user; the INSERT policy pins
 * id = app_uid() AND role IN ('brand','creator')). role is immutable after
 * creation (no UPDATE grant on the column) AND pinned at creation.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  role: userRoleEnum("role").notNull(),
  fullName: text("full_name").notNull().default(""),
  company: text("company").notNull().default(""),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const creatorProfiles = pgTable(
  "creator_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => profiles.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    bio: text("bio").notNull().default(""),
    location: text("location").notNull().default(""),
    theme: themeEnum("theme").notNull().default("projection"),
    formats: text("formats").array().notNull().default([]),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("creator_profiles_slug_shape", sql`${t.slug} ~ '^[a-z0-9-]{3,40}$'`),
    check(
      "creator_profiles_formats_subset",
      sql`${t.formats} <@ ARRAY['projection','fooh','anamorphic','drone','street']::text[]`,
    ),
    check("creator_profiles_bio_len", sql`char_length(${t.bio}) <= 2000`),
  ],
);

export const packages = pgTable(
  "packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceCents: integer("price_cents").notNull(),
    turnaroundDays: integer("turnaround_days").notNull().default(14),
    deliverableSummary: text("deliverable_summary").notNull().default(""),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("packages_price_nonneg", sql`${t.priceCents} >= 0`),
    check("packages_name_len", sql`char_length(${t.name}) <= 120`),
    check(
      "packages_description_len",
      sql`char_length(${t.description}) <= 4000`,
    ),
  ],
);

export const usageRightsOptions = pgTable(
  "usage_rights_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("usage_rights_delta_nonneg", sql`${t.priceDeltaCents} >= 0`),
    check("usage_rights_name_len", sql`char_length(${t.name}) <= 120`),
    check(
      "usage_rights_description_len",
      sql`char_length(${t.description}) <= 4000`,
    ),
  ],
);

export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    mediaKey: text("media_key").notNull(),
    mediaType: text("media_type").notNull().default("image"),
    format: text("format"),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("portfolio_title_len", sql`char_length(${t.title}) <= 200`)],
);

/**
 * status/payment_state are NOT in app_user's INSERT/UPDATE column allowlists —
 * they exist only via these defaults and the SECURITY DEFINER transition
 * function. price_cents/fee_cents are re-derived authoritatively by that
 * function at inquiry→proposal.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "restrict" }),
    usageRightsOptionId: uuid("usage_rights_option_id")
      .notNull()
      .references(() => usageRightsOptions.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    brief: text("brief").notNull().default(""),
    status: bookingStatusEnum("status").notNull().default("inquiry"),
    paymentState: paymentStateEnum("payment_state").notNull().default("none"),
    priceCents: integer("price_cents").notNull().default(0),
    feeCents: integer("fee_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("bookings_brand_idx").on(t.brandId),
    index("bookings_creator_idx").on(t.creatorId),
    check("bookings_price_nonneg", sql`${t.priceCents} >= 0`),
    check("bookings_fee_nonneg", sql`${t.feeCents} >= 0`),
    check("bookings_title_len", sql`char_length(${t.title}) <= 140`),
    check("bookings_brief_len", sql`char_length(${t.brief}) <= 8000`),
  ],
);

/**
 * Append-only audit trail. app_user: SELECT only (participants, via policy).
 * The SD function (owner) is the sole writer.
 */
export const bookingEvents = pgTable(
  "booking_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id"),
    fromStatus: bookingStatusEnum("from_status").notNull(),
    toStatus: bookingStatusEnum("to_status").notNull(),
    priceCentsSnapshot: integer("price_cents_snapshot"),
    feeCentsSnapshot: integer("fee_cents_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("booking_events_booking_idx").on(t.bookingId)],
);

export const deliverables = pgTable(
  "deliverables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => profiles.id),
    version: integer("version").notNull().default(1),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("deliverables_booking_idx").on(t.bookingId),
    check("deliverables_note_len", sql`char_length(${t.note}) <= 2000`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => profiles.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("messages_booking_idx").on(t.bookingId),
    check(
      "messages_body_len",
      sql`char_length(${t.body}) BETWEEN 1 AND 4000`,
    ),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => profiles.id),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
    check("reviews_body_len", sql`char_length(${t.body}) <= 2000`),
  ],
);

/**
 * Singleton platform configuration, read by the SECURITY DEFINER transition
 * function (as owner) when it re-derives fee_cents — the DB is the trust
 * boundary, and env PLATFORM_FEE_BPS is display-only. No app_user grants.
 */
export const platformConfig = pgTable(
  "platform_config",
  {
    id: integer("id").primaryKey().default(1),
    feeBps: integer("fee_bps").notNull().default(1000),
  },
  (t) => [
    check("platform_config_singleton", sql`${t.id} = 1`),
    check("platform_config_fee_range", sql`${t.feeBps} BETWEEN 0 AND 5000`),
  ],
);

/* ─────────────── Phase 2/3 tables (created now, unused, zero grants) ─────────────── */

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_provider_event").on(t.provider, t.eventId)],
);

export const briefs = pgTable("briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  budgetCents: integer("budget_cents"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const briefResponses = pgTable("brief_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => briefs.id, { onDelete: "cascade" }),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => creatorProfiles.id, { onDelete: "cascade" }),
  body: text("body").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ────────────────────────────── views ──────────────────────────────
 * Created in the RLS migration with `WITH (security_invoker = true)` —
 * declared .existing() here so drizzle-kit does not try to manage it.
 */
export const publicCreatorView = pgView("public_creator_view", {
  id: uuid("id"),
  userId: uuid("user_id"),
  slug: text("slug"),
  displayName: text("display_name"),
  bio: text("bio"),
  location: text("location"),
  theme: themeEnum("theme"),
  formats: text("formats").array(),
  avatarUrl: text("avatar_url"),
  fullName: text("full_name"),
}).existing();

/* ────────────────────────────── types ────────────────────────────── */

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type Theme = (typeof themeEnum.enumValues)[number];
export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
export type PaymentState = (typeof paymentStateEnum.enumValues)[number];

export type Profile = typeof profiles.$inferSelect;
export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type Package = typeof packages.$inferSelect;
export type UsageRightsOption = typeof usageRightsOptions.$inferSelect;
export type PortfolioItem = typeof portfolioItems.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingEvent = typeof bookingEvents.$inferSelect;
export type Deliverable = typeof deliverables.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Review = typeof reviews.$inferSelect;
