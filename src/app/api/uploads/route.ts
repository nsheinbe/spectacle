import { NextResponse } from "next/server";

import { getServerSession, toIdentity } from "@/lib/auth/session";
import { presignPutSchema } from "@/lib/validation";
import { authorizePutKey, getStoragePort } from "@/storage";

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
