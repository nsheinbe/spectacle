import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Dev/test backend for LocalFsAdapter's signed pseudo-URLs. Auth is the HMAC
 * the adapter minted (same shape as a presigned URL: verb + bucket + key +
 * expiry); the participant/authorization gates already ran BEFORE the URL
 * was minted — this route only honors the signature, exactly like R2 would.
 * Never used when R2 is configured.
 */

const STORE = path.join(process.cwd(), ".local-storage");

function verify(params: URLSearchParams): { bucket: string; key: string; verb: string } | null {
  const verb = params.get("verb") ?? "";
  const bucket = params.get("bucket") ?? "";
  const key = params.get("key") ?? "";
  const exp = params.get("exp") ?? "";
  const sig = params.get("sig") ?? "";
  if (!verb || !bucket || !key || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  if (key.includes("..")) return null;
  const secret = env.BETTER_AUTH_SECRET ?? "local-dev-storage-secret";
  const expected = createHmac("sha256", secret)
    .update(`${verb}:${bucket}:${key}:${exp}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { bucket, key, verb };
}

export async function GET(req: Request) {
  const parsed = verify(new URL(req.url).searchParams);
  if (!parsed || parsed.verb !== "get") return new Response("Forbidden", { status: 403 });
  try {
    const data = await readFile(path.join(STORE, parsed.bucket, parsed.key));
    return new Response(new Uint8Array(data), { status: 200 });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function PUT(req: Request) {
  const parsed = verify(new URL(req.url).searchParams);
  if (!parsed || parsed.verb !== "put") return new Response("Forbidden", { status: 403 });
  const target = path.join(STORE, parsed.bucket, parsed.key);
  mkdirSync(path.dirname(target), { recursive: true });
  const body = Buffer.from(await req.arrayBuffer());
  await writeFile(target, body);
  return new Response(null, { status: 200 });
}
