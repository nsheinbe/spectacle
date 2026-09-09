import { NextResponse } from "next/server";

import { getServerSession, toIdentity } from "@/lib/auth/session";
import { presignGetSchema, presignPutSchema } from "@/lib/validation";
import {
  authorizePutKey,
  getStoragePort,
  makeDeliverablePresigner,
  StorageForbiddenError,
} from "@/storage";

export const runtime = "nodejs";

/**
 * presignPut: per-prefix authorization runs BEFORE any adapter call —
 * deliverables/{bookingId}/… (creator participant), portfolio/{creatorId}/…
 * (owning creator), avatars/{userId} (self). MIME allowlist + size cap are
 * enforced here and carried into the presign conditions.
 */
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session || !session.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = presignPutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { key, contentType, sizeBytes } = parsed.data;
  if (!(await authorizePutKey(toIdentity(session), key))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const bucket = key.startsWith("deliverables/") ? ("deliverables" as const) : ("public" as const);
  const { url } = await getStoragePort().presignPut({
    bucket,
    key,
    contentType,
    maxSizeBytes: sizeBytes,
    expiresSeconds: 10 * 60,
  });
  return NextResponse.json({ url });
}

/**
 * presignGet: participant-only. Key must live under deliverables/{bookingId}/.
 * A stranger (or a foreign-prefix key) is 403 — same gate verify-gates probes.
 */
export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session || !session.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const parsed = presignGetSchema.safeParse({
    bookingId: url.searchParams.get("bookingId"),
    key: url.searchParams.get("key"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const presigner = makeDeliverablePresigner({ port: getStoragePort() });
  try {
    const signed = await presigner.presignGet(
      toIdentity(session),
      parsed.data.bookingId,
      parsed.data.key,
    );
    return NextResponse.json({ url: signed });
  } catch (err) {
    if (err instanceof StorageForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw err;
  }
}
