/**
 * Storage behind a port: R2Adapter when the R2 env set is complete,
 * LocalFsAdapter otherwise (dev/test). ALL authorization runs in our code
 * BEFORE any adapter call (see presign.ts) — adapters only sign.
 *
 * NOTE: this directory must never read the process environment — configuration arrives
 * via '@/lib/env'. verify-gates fs-scans src/storage/** and fails on any
 * env-read reference: an env-controlled branch around the participant
 * gate is the exact fail-open the canary table exists to catch.
 */

export type StorageBucket = "deliverables" | "public";

export type PresignPutOptions = {
  bucket: StorageBucket;
  key: string;
  contentType: string;
  maxSizeBytes: number;
  expiresSeconds: number;
};

export type PresignGetOptions = {
  bucket: StorageBucket;
  key: string;
  expiresSeconds: number;
};

export type StoragePort = {
  presignPut(opts: PresignPutOptions): Promise<{ url: string; method: "PUT" }>;
  presignGet(opts: PresignGetOptions): Promise<string>;
  delete(opts: { bucket: StorageBucket; key: string }): Promise<void>;
};

export class StorageForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "StorageForbiddenError";
  }
}
