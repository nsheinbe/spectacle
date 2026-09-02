"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  bookings,
  messages,
  packages,
  usageRightsOptions,
  withUser,
} from "@/db";
import { getServerSession, toIdentity } from "@/lib/auth/session";
import {
  BookingTransitionError,
  transitionBooking,
} from "@/lib/bookings/transition";
import { env } from "@/lib/env";
import {
  bookingBriefUpdateSchema,
  bookingCreateSchema,
  messageSendSchema,
  transitionSchema,
} from "@/lib/validation";

export type ActionState = { error?: string };

/**
 * Creates the booking at `inquiry`. price/fee are derived server-side here
 * for DISPLAY (package + rights option + PLATFORM_FEE_BPS); the SECURITY
 * DEFINER function re-derives both authoritatively at inquiry→proposal, so
 * nothing downstream trusts these numbers.
 */
export async function createBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  if (session.role !== "brand") return { error: "Only brands can book." };

  const parsed = bookingCreateSchema.safeParse({
    packageId: formData.get("packageId"),
    usageRightsOptionId: formData.get("usageRightsOptionId"),
    title: formData.get("title"),
    brief: formData.get("brief") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  const bookingId = await withUser(toIdentity(session), async (tx) => {
    const [pkg] = await tx
      .select()
      .from(packages)
      .where(and(eq(packages.id, input.packageId), eq(packages.active, true)));
    if (!pkg) return null;
    const [rights] = await tx
      .select()
      .from(usageRightsOptions)
      .where(
        and(
          eq(usageRightsOptions.id, input.usageRightsOptionId),
          eq(usageRightsOptions.creatorId, pkg.creatorId),
          eq(usageRightsOptions.active, true),
        ),
      );
    if (!rights) return null;
    const priceCents = pkg.priceCents + rights.priceDeltaCents;
    const feeCents = Math.floor((priceCents * env.PLATFORM_FEE_BPS) / 10_000);
    // Raw SQL, deliberately: drizzle's insert() names EVERY column (with
    // DEFAULT for the unspecified), and Postgres column-level INSERT
    // privileges cover every column named in the list — which would trip the
    // bookings column allowlist that keeps status/payment_state unwritable.
    const created = await tx.execute(sql`
      insert into bookings
        (brand_id, creator_id, package_id, usage_rights_option_id, title, brief, price_cents, fee_cents)
      values
        (${session.userId}, ${pkg.creatorId}, ${pkg.id}, ${rights.id}, ${input.title}, ${input.brief}, ${priceCents}, ${feeCents})
      returning id
    `);
    return (created.rows[0] as { id: string } | undefined)?.id ?? null;
  });

  if (!bookingId) return { error: "That package is no longer available." };
  redirect(`/bookings/${bookingId}`);
}

export async function transitionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  const parsed = transitionSchema.safeParse({
    bookingId: formData.get("bookingId"),
    to: formData.get("to"),
  });
  if (!parsed.success) return { error: "Invalid transition" };
  try {
    await transitionBooking(
      toIdentity(session),
      parsed.data.bookingId,
      parsed.data.to,
    );
  } catch (err) {
    if (err instanceof BookingTransitionError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/bookings/${parsed.data.bookingId}`);
  return {};
}

export async function sendMessageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  const parsed = messageSendSchema.safeParse({
    bookingId: formData.get("bookingId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid message" };
  }
  try {
    await withUser(toIdentity(session), async (tx) => {
      await tx.insert(messages).values({
        bookingId: parsed.data.bookingId,
        senderId: session.userId,
        body: parsed.data.body,
      });
    });
  } catch {
    return { error: "Could not send — you may not have access to this booking." };
  }
  revalidatePath(`/bookings/${parsed.data.bookingId}`);
  return {};
}

export async function updateBriefAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  const parsed = bookingBriefUpdateSchema.safeParse({
    bookingId: formData.get("bookingId"),
    title: formData.get("title"),
    brief: formData.get("brief"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const updated = await withUser(toIdentity(session), async (tx) => {
    const rows = await tx
      .update(bookings)
      .set({ title: parsed.data.title, brief: parsed.data.brief })
      .where(eq(bookings.id, parsed.data.bookingId))
      .returning({ id: bookings.id });
    return rows.length;
  });
  if (updated === 0) {
    return { error: "Brief can no longer be edited (booking has advanced)." };
  }
  revalidatePath(`/bookings/${parsed.data.bookingId}`);
  return {};
}
