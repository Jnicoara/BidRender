/**
 * Where bytes get written — the one piece that knows about Cloudflare.
 *
 * ── Kept behind an interface on purpose ─────────────────────────────────────
 * R2 is the confirmed choice and this is not built to be provider-agnostic for
 * its own sake. But everything else in this folder — enumerating tables,
 * dumping rows, copying files, reporting — is about BidRender's data and has no
 * opinion about the destination. Putting the destination behind three methods
 * means swapping it later is one new file rather than a rewrite, and it is what
 * lets the tests prove the whole pipeline works without a network or a
 * credential.
 *
 * R2 speaks the S3 API, so this is the AWS SDK the repo already depends on for
 * the Manus storage proxy — no new dependency for a tool whose whole purpose is
 * to work when things are going wrong.
 */
import {
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { Readable } from "node:stream";
import type { R2Config } from "./config";

/**
 * How much of a streamed file is held in memory at once.
 *
 * 8MB per part, four parts in flight — about 32MB, whatever the file's size.
 * That is the whole point of the streaming path: the ceiling is a property of
 * this constant rather than of the largest plan anybody uploads.
 */
const STREAM_PART_BYTES = 8 * 1024 * 1024;
const STREAM_CONCURRENCY = 4;

export type BackupTarget = {
  /** Shown in the report, so a manifest says where it actually went. */
  readonly name: string;
  /** Fails loudly. Every caller treats a rejection as a failed backup. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /**
   * The same, for a body too big to hold in memory.
   *
   * Separate from `put` rather than replacing it. The database dump and the
   * manifest are small, already in memory, and are built as Buffers — routing
   * them through a multipart uploader would add machinery for no benefit. A
   * plan file is the opposite case: it can be 2GB, and buffering it is how a
   * nightly job gets killed on a small instance.
   *
   * `contentLength` is passed on when storage told us, because it lets the
   * uploader size its parts sensibly; null is fine and simply means it cannot.
   */
  putStream(
    key: string,
    body: Readable,
    contentType: string,
    contentLength: number | null
  ): Promise<void>;
  /**
   * Cheap reachability check, run BEFORE the database is read.
   *
   * The alternative is discovering a bad credential after dumping every table
   * and downloading every PDF, which on a slow connection is the difference
   * between a typo and a wasted hour.
   */
  check(): Promise<void>;
  /**
   * Read an object back.
   *
   * Only the verifier uses this, and that is the point: a backup nobody has
   * ever read back is a hypothesis. See scripts/verifyBackup.mts.
   */
  get(key: string): Promise<Buffer>;
  /** Object keys under a prefix, so the verifier can find the newest run. */
  list(prefix: string): Promise<string[]>;
};

export function createR2Target(config: R2Config): BackupTarget {
  const client = new S3Client({
    region: "auto", // R2 ignores region but the SDK requires one.
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    name: `r2://${config.bucket}/${config.prefix}`,

    async check() {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    },

    async putStream(key, body, contentType, contentLength) {
      const upload = new Upload({
        client,
        params: {
          Bucket: config.bucket,
          Key: `${config.prefix}/${key}`.replace(/\/+/g, "/"),
          Body: body,
          ContentType: contentType,
          ...(contentLength !== null ? { ContentLength: contentLength } : {}),
        },
        queueSize: STREAM_CONCURRENCY,
        partSize: STREAM_PART_BYTES,
        // A failed multipart upload leaves parts behind that do not show in a
        // listing but do cost storage. Abort on failure rather than waiting for
        // the bucket's expiry rule to notice.
        leavePartsOnError: false,
      });
      await upload.done();
    },

    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: `${config.prefix}/${key}`.replace(/\/+/g, "/"),
          Body: body,
          ContentType: contentType,
        })
      );
    },

    async get(key) {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: `${config.prefix}/${key}`.replace(/\/+/g, "/"),
        })
      );
      const chunks: Buffer[] = [];
      // The SDK hands back a Node stream here; collect it rather than using
      // transformToByteArray(), which is not present on every SDK version.
      const stream = response.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    },

    async list(prefix) {
      const full = `${config.prefix}/${prefix}`.replace(/\/+/g, "/");
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: full,
            ContinuationToken: token,
          })
        );
        for (const item of response.Contents ?? []) {
          if (item.Key) {
            // Hand back keys relative to the prefix, so callers never have to
            // know it — the same shape `put` and `get` accept.
            keys.push(item.Key.slice(`${config.prefix}/`.length));
          }
        }
        token = response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
      } while (token);
      return keys;
    },
  };
}
