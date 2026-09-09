import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import { deliverables, withUser, type SessionIdentity } from "@/db";
import { authorizePutKey } from "@/storage";

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DELIVERABLE_KEY_RE = new RegExp(`^deliverables/(${UUID_RE})/`);

/** Basename only; no path separators; conservative charset for object keys. */
export function safeDeliverableFileName(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").trim();
  const cleaned = base.replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "");
  return (cleaned || "file").slice(0, 180);
}

export function deliverableStorageKey(bookingId: string, fileName: string): string {
  return `deliverables/${bookingId}/${randomUUID()}/${safeDeliverableFileName(fileName)}`;
}

export function deliverableKeyMatchesBooking(storageKey: string, bookingId: string): boolean {
  const match = DELIVERABLE_KEY_RE.exec(storageKey);
  return match?.[1] === bookingId;
}

export async function assertCreatorCanPutDeliverable(
  session: SessionIdentity,
  storageKey: string,
): Promise<boolean> {
  return authorizePutKey(session, storageKey);
}

export async function insertDeliverable(
  session: SessionIdentity,
  input: {
    bookingId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    note: string;
  },
): Promise<{ id: string; version: number } | null> {
  if (!deliverableKeyMatchesBooking(input.storageKey, input.bookingId)) {
    return null;
  }
  return withUser(session, async (tx) => {
    const [latest] = await tx
      .select({ version: deliverables.version })
      .from(deliverables)
      .where(eq(deliverables.bookingId, input.bookingId))
      .orderBy(desc(deliverables.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    const inserted = await tx
      .insert(deliverables)
      .values({
        bookingId: input.bookingId,
        uploaderId: session.userId,
        version,
        storageKey: input.storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        note: input.note,
      })
      .returning({ id: deliverables.id, version: deliverables.version });
    return inserted[0] ?? null;
  });
}
