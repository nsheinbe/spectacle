"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerSession, toIdentity } from "@/lib/auth/session";
import {
  assertCreatorCanPutDeliverable,
  deliverableKeyMatchesBooking,
  deliverableStorageKey,
  insertDeliverable,
  safeDeliverableFileName,
} from "@/lib/deliverables";
import {
  deliverablePrepareSchema,
  deliverableRecordSchema,
} from "@/lib/validation";
import { getStoragePort } from "@/storage";

export type DeliverableActionState = { error?: string };

export type PreparedDeliverableUpload = {
  key: string;
  url: string;
};

export async function prepareDeliverableUploadAction(
  input: unknown,
): Promise<PreparedDeliverableUpload | DeliverableActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  const parsed = deliverablePrepareSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid upload" };
  }
  const fileName = safeDeliverableFileName(parsed.data.fileName);
  const key = deliverableStorageKey(parsed.data.bookingId, fileName);
  const identity = toIdentity(session);
  if (!(await assertCreatorCanPutDeliverable(identity, key))) {
    return { error: "Only the booking's creator can upload a version." };
  }
  const { url } = await getStoragePort().presignPut({
    bucket: "deliverables",
    key,
    contentType: parsed.data.contentType,
    maxSizeBytes: parsed.data.sizeBytes,
    expiresSeconds: 10 * 60,
  });
  return { key, url };
}

export async function recordDeliverableAction(
  input: unknown,
): Promise<DeliverableActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  const parsed = deliverableRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid deliverable" };
  }
  const d = parsed.data;
  if (!deliverableKeyMatchesBooking(d.storageKey, d.bookingId)) {
    return { error: "Storage key does not belong to this booking." };
  }
  const identity = toIdentity(session);
  if (!(await assertCreatorCanPutDeliverable(identity, d.storageKey))) {
    return { error: "Only the booking's creator can record a version." };
  }
  try {
    const row = await insertDeliverable(identity, {
      bookingId: d.bookingId,
      storageKey: d.storageKey,
      fileName: safeDeliverableFileName(d.fileName),
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      note: d.note,
    });
    if (!row) return { error: "Could not record this version." };
  } catch {
    return { error: "Could not record this version — you may not have access." };
  }
  revalidatePath(`/bookings/${d.bookingId}`);
  return {};
}
