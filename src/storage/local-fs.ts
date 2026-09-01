import { createHmac } from "node:crypto";

import type { PresignGetOptions, PresignPutOptions, StoragePort } from "./port";

/**
 * Dev/test adapter: mints signed pseudo-URLs against the local app
 * (/api/local-storage). Files live under .local-storage/ (gitignored).
 * Everything up to the network boundary — key schema, TTLs, participant
 * gating — is exercised identically to R2; only the final HTTP round-trip
 * differs (documented as unproven without R2 credentials in the README).
 */
export function makeLocalFsAdapter(opts: {
  baseUrl: string;
  secret: string;
}): StoragePort {
  const sign = (payload: string): string =>
    createHmac("sha256", opts.secret).update(payload).digest("hex");

  const makeUrl = (
    verb: "get" | "put",
    bucket: string,
    key: string,
    expiresSeconds: number,
  ): string => {
    const exp = Date.now() + expiresSeconds * 1000;
    const payload = `${verb}:${bucket}:${key}:${exp}`;
    const params = new URLSearchParams({
      verb,
      bucket,
      key,
      exp: String(exp),
      sig: sign(payload),
    });
    return `${opts.baseUrl}/api/local-storage?${params.toString()}`;
  };

  return {
    async presignPut({ bucket, key, expiresSeconds }: PresignPutOptions) {
      return { url: makeUrl("put", bucket, key, expiresSeconds), method: "PUT" as const };
    },
    async presignGet({ bucket, key, expiresSeconds }: PresignGetOptions) {
      return makeUrl("get", bucket, key, expiresSeconds);
    },
    async delete() {
      /* local files are ephemeral; deletion is a no-op in Phase 1 dev */
    },
  };
}
