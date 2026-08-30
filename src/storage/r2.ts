import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { PresignGetOptions, PresignPutOptions, StorageBucket, StoragePort } from "./port";

/**
 * Cloudflare R2 via the S3 API. Configuration is passed in from '@/lib/env'
 * by index.ts — this module never touches the process environment (verify-gates enforces).
 * Real R2 round-trips are unproven without credentials; see README.
 */
export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  buckets: Record<StorageBucket, string>;
};

export function makeR2Adapter(config: R2Config): StoragePort {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async presignPut({ bucket, key, contentType, maxSizeBytes, expiresSeconds }: PresignPutOptions) {
      const command = new PutObjectCommand({
        Bucket: config.buckets[bucket],
        Key: key,
        ContentType: contentType,
        ContentLength: maxSizeBytes,
      });
      const url = await getSignedUrl(client, command, { expiresIn: expiresSeconds });
      return { url, method: "PUT" as const };
    },
    async presignGet({ bucket, key, expiresSeconds }: PresignGetOptions) {
      const command = new GetObjectCommand({ Bucket: config.buckets[bucket], Key: key });
      return getSignedUrl(client, command, { expiresIn: expiresSeconds });
    },
    async delete({ bucket, key }) {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.buckets[bucket], Key: key }),
      );
    },
  };
}
