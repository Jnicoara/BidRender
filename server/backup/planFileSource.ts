/**
 * Reading plan files out of R2, for the backup to copy.
 *
 * ── Why a stream and not a Buffer ────────────────────────────────────────────
 * The backup used to pull each file fully into memory before uploading it. That
 * was fine when a plan was 20MB and a lie the moment the size limit went to
 * 2GB: a nightly job that allocates 2GB on a small hosting instance is a
 * nightly job that gets killed, and a backup that is killed is no backup.
 *
 * So the body is handed on as a stream. Memory becomes a fixed few tens of
 * megabytes — whatever the multipart uploader holds in flight — regardless of
 * whether the file is 2MB or 2GB.
 *
 * ── Read-only, deliberately ──────────────────────────────────────────────────
 * This client is built from R2_PLANS_READONLY_*, a token with Object Read and
 * nothing else on the plan bucket. It cannot write, overwrite or delete a plan.
 * See server/backup/config.ts for the reasoning, including why this is a second
 * token rather than one credential spanning both buckets.
 */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { readPlansReadConfig, type PlansReadConfig } from "./config";

/** A file's bytes, and how many of them there are. */
export type FileStream = {
  body: Readable;
  /** From R2's own ContentLength. Null when it did not say. */
  contentLength: number | null;
};

/**
 * Where the backup gets a file's bytes.
 *
 * A parameter rather than an import, so the tests can run the whole pipeline
 * without a network or a credential — the same reason `BackupTarget` is an
 * interface. See server/backup.test.ts.
 */
export type FileStreamSource = {
  readonly name: string;
  open(key: string): Promise<FileStream>;
};

let cached: { client: S3Client; config: PlansReadConfig } | null = null;

function plansClient(): { client: S3Client; config: PlansReadConfig } {
  if (cached) return cached;
  const result = readPlansReadConfig();
  if (!result.ok) {
    throw new Error(
      `The read-only plan credentials are not configured. Missing: ${result.missing.join(", ")}.`
    );
  }
  cached = {
    client: new S3Client({
      region: "auto", // R2 ignores region but the SDK requires one.
      endpoint: result.config.endpoint,
      credentials: {
        accessKeyId: result.config.accessKeyId,
        secretAccessKey: result.config.secretAccessKey,
      },
    }),
    config: result.config,
  };
  return cached;
}

/** Drop the memoised client. For tests that change the environment. */
export function resetPlanSourceForTests(): void {
  cached = null;
}

/** True when the backup can read plan files at all. */
export function planSourceConfigured(): boolean {
  return readPlansReadConfig().ok;
}

export function createPlanFileSource(): FileStreamSource {
  return {
    get name() {
      return `r2://${plansClient().config.bucket} (read-only)`;
    },
    async open(key: string): Promise<FileStream> {
      const { client, config } = plansClient();
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key })
      );
      if (!response.Body) {
        throw new Error(`storage returned no body for ${key}`);
      }
      return {
        body: response.Body as Readable,
        contentLength: response.ContentLength ?? null,
      };
    },
  };
}

/**
 * The old path: read a file through the Manus presign proxy.
 *
 * Kept for as long as anything is still stored there. It buffers the whole file
 * because that is all the proxy offers — which is exactly the limitation that
 * made the R2 source worth building, and the reason this one should not be used
 * for anything large.
 */
export function createManusFileSource(): FileStreamSource {
  return {
    name: "manus storage proxy (buffered)",
    async open(key: string): Promise<FileStream> {
      const { storageGetSignedUrl } = await import("../storage");
      const url = await storageGetSignedUrl(key);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`storage returned ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const { Readable: NodeReadable } = await import("node:stream");
      return {
        body: NodeReadable.from(buffer),
        contentLength: buffer.byteLength,
      };
    },
  };
}

/**
 * The source this server should use.
 *
 * R2 when its read-only credentials are present, the Manus proxy otherwise. The
 * same shape of decision the storage backend makes, and for the same reason: a
 * deployment part-way through the move must keep working.
 */
export function defaultFileSource(): FileStreamSource {
  return planSourceConfigured()
    ? createPlanFileSource()
    : createManusFileSource();
}
