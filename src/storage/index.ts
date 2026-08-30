import { env, need, r2Configured } from "../lib/env";
import { makeLocalFsAdapter } from "./local-fs";
import { makeR2Adapter } from "./r2";
import type { StoragePort } from "./port";

export { StorageForbiddenError, type StoragePort } from "./port";
export {
  authorizePutKey,
  DELIVERABLE_GET_TTL_SECONDS,
  isBookingParticipant,
  makeDeliverablePresigner,
} from "./presign";

let port: StoragePort | null = null;

export function getStoragePort(): StoragePort {
  if (!port) {
    port = r2Configured()
      ? makeR2Adapter({
          accountId: need("R2_ACCOUNT_ID"),
          accessKeyId: need("R2_ACCESS_KEY_ID"),
          secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
          buckets: {
            deliverables: need("R2_BUCKET_DELIVERABLES"),
            public: need("R2_BUCKET_PUBLIC"),
          },
        })
      : makeLocalFsAdapter({
          baseUrl: env.BETTER_AUTH_URL,
          secret: env.BETTER_AUTH_SECRET ?? "local-dev-storage-secret",
        });
  }
  return port;
}
