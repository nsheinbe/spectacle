import { z } from "zod";

/**
 * Every Server Action parses its input here BEFORE touching withUser. The
 * database still enforces its own bounds (CHECK constraints, RLS) — zod is
 * the UX layer, Postgres is the trust boundary.
 */

export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "book",
  "bookings",
  "browse",
  "c",
  "dashboard",
  "local-storage",
  "onboarding",
  "settings",
  "spectacle",
]);

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]{3,40}$/, "3-40 chars: lowercase letters, digits, hyphens")
  .refine((s) => !RESERVED_SLUGS.has(s), "This name is reserved");

export const roleSelectionSchema = z.object({
  role: z.enum(["brand", "creator"]),
  fullName: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).optional(),
});

export const bookingCreateSchema = z.object({
  packageId: z.string().uuid(),
  usageRightsOptionId: z.string().uuid(),
  title: z.string().trim().min(1).max(140),
  brief: z.string().trim().max(8000),
});

export const bookingBriefUpdateSchema = z.object({
  bookingId: z.string().uuid(),
  title: z.string().trim().min(1).max(140),
  brief: z.string().trim().max(8000),
});

export const messageSendSchema = z.object({
  bookingId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export const transitionSchema = z.object({
  bookingId: z.string().uuid(),
  to: z.enum([
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
  ]),
});

export const creatorProfileSchema = z.object({
  slug: slugSchema,
  displayName: z.string().trim().min(1).max(120),
  bio: z.string().trim().max(2000),
  location: z.string().trim().max(120),
  theme: z.enum(["projection", "fooh", "anamorphic", "drone", "street"]),
  formats: z
    .array(z.enum(["projection", "fooh", "anamorphic", "drone", "street"]))
    .max(5),
});

export const packageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000),
  priceCents: z.number().int().min(0).max(100_000_000),
  turnaroundDays: z.number().int().min(1).max(365),
  deliverableSummary: z.string().trim().max(1000),
  active: z.boolean(),
});

export const usageRightsSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000),
  priceDeltaCents: z.number().int().min(0).max(100_000_000),
  active: z.boolean(),
});

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120),
});

export const UPLOAD_MIME_ALLOWLIST = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
]);

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

export const presignPutSchema = z.object({
  key: z.string().min(1).max(512),
  contentType: z.string().refine((m) => UPLOAD_MIME_ALLOWLIST.has(m), "Unsupported file type"),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});
