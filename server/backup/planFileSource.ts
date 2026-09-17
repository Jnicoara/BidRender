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
 *
 * ── There is no second route, on purpose ─────────────────────────────────────
 * There used to be a fallback that fetched each file through the Manus presign
 * proxy and buffered the whole thing. It went with the rest of the Manus
 * storage code, and nothing replaced it, because the alternative is worse than
 * a hard stop: the database dump and the manifest would still upload, so the
 * run would report itself as a success with a list of warnings, and the one
 * thing missing would be every contractor's drawings. Nobody reads the warnings
 * on a backup that says it worked. So a missing credential stops the backup
 * before it starts, and names the variable.
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

/** The message a missing credential gets, in one place so it reads the same. */
export function missingPlanCredentialsMessage(missing: string[]): string {
  return (
    `The backup cannot read plan files: the read-only plan credentials are not configured. ` +
    `Missing: ${missing.join(", ")}. ` +
    `Set them on the host that runs the backup — R2_PLANS_READONLY_ACCESS_KEY_ID and ` +
    `R2_PLANS_READONLY_SECRET_ACCESS_KEY come from the "bidrender-plans-readonly" Cloudflare API token ` +
    `(Object Read only, bidrender-plans only). Refusing rather than backing up the database without the plans.`
  );
}

function plansClient(): { client: S3Client; config: PlansReadConfig } {
  if (cached) return cached;
  const result = readPlansReadConfig();
  if (!result.ok) {
    throw new Error(missingPlanCredentialsMessage(result.missing));
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
 * The source this server should use.
 *
 * Throws, naming the variables, when the read-only credentials are absent. See
 * the header: the failure has to happen here, before a run starts, because
 * every later point would produce a backup that calls itself a success.
 */
export function defaultFileSource(): FileStreamSource {
  const result = readPlansReadConfig();
  if (!result.ok) {
    throw new Error(missingPlanCredentialsMessage(result.missing));
  }
  return createPlanFileSource();
}
