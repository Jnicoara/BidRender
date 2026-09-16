/**
 * The one file that talks to Cloudflare R2 about the app's files.
 *
 * Same shape as `diskStorage.ts`: keys, the tokenized
 * `/manus-storage/<token>/<key>` read URLs and the two-step upload (ticket,
 * then confirm) are unchanged, so nothing above the storage layer knows the
 * difference. The browser still PUTs to the upload URL it is handed; that URL
 * now points at R2.
 *
 * ── No key prefix, on purpose ────────────────────────────────────────────────
 * The object key in the bucket IS the storage key the database already holds —
 * `bid-plans/<user>/<bid>/<file>`, `company-logos/<user>/<file>`. The backup
 * tool prefixes its keys because it shares a bucket with other things; this one
 * has a bucket to itself, so a prefix would buy nothing and cost everything:
 * adding one later would orphan every stored file, because the key recorded
 * against a bid would no longer name the object. `r2StorageTest` pins this.
 *
 * ── R2 speaks S3 ─────────────────────────────────────────────────────────────
 * So this is the AWS SDK the repo already depends on for the Manus proxy and
 * the backup target. No new dependency.
 */
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readR2PlansConfig, type R2PlansConfig } from "./storageBackend";

/**
 * How long an upload URL stays good.
 *
 * An hour, matching the on-disk backend, and for the same reason: it is minted
 * with the ticket and used straight away, but a large plan set on a slow site
 * connection can take a while to finish.
 */
const UPLOAD_WINDOW_SECONDS = 60 * 60;

/**
 * How long a download URL stays good.
 *
 * Shorter than the upload window and much shorter than the read token that
 * fronts it, because it does not have to outlive a working session: the proxy
 * mints a fresh one on every request it redirects, so the only thing this has
 * to cover is a single browser following a single redirect.
 */
const DOWNLOAD_WINDOW_SECONDS = 15 * 60;

let cachedClient: { client: S3Client; config: R2PlansConfig } | null = null;

/**
 * The client and bucket, built once.
 *
 * Throws naming the missing variables. A caller reaching here has already been
 * told by `selectStorageBackend` that R2 is the backend, so an incomplete
 * config at this point is a genuine misconfiguration and not a fallback case.
 */
export function r2Client(): { client: S3Client; config: R2PlansConfig } {
  return r2();
}

function r2(): { client: S3Client; config: R2PlansConfig } {
  if (cachedClient) return cachedClient;

  const result = readR2PlansConfig();
  if (!result.ok) {
    throw new Error(
      `The plan bucket is not configured. Missing: ${result.missing.join(", ")}.`
    );
  }

  const client = new S3Client({
    region: "auto", // R2 ignores region but the SDK requires one.
    endpoint: result.config.endpoint,
    credentials: {
      accessKeyId: result.config.accessKeyId,
      secretAccessKey: result.config.secretAccessKey,
    },
  });

  cachedClient = { client, config: result.config };
  return cachedClient;
}

/** Write an object from this process — the server-side `storagePut` path. */
export async function r2PutObject(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<void> {
  const { client, config } = r2();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: typeof data === "string" ? Buffer.from(data) : data,
      ContentType: contentType,
    })
  );
  rememberExistence(key, true);
}

/**
 * A signed PUT the BROWSER uploads to, so this process is out of the data path.
 *
 * A cross-origin PUT is always preflighted, so the bucket must publish a CORS
 * rule permitting the app's origin. When it does not, the client falls back to
 * the same-origin route in `planUpload.ts`, which forwards the bytes from here.
 */
export async function r2PresignPut(
  key: string,
  contentType: string
): Promise<string> {
  const { client, config } = r2();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: UPLOAD_WINDOW_SECONDS }
  );
}

/**
 * A signed GET for reading one object.
 *
 * Range requests work through this: SigV4 query signing does not cover the
 * Range header, so pdf.js can ask for any slice of a plan on the signed URL it
 * was redirected to — which is what makes a large sheet set stream rather than
 * download whole.
 */
export async function r2PresignGet(key: string): Promise<string> {
  const { client, config } = r2();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: DOWNLOAD_WINDOW_SECONDS }
  );
}

/**
 * How long a viewer link lasts.
 *
 * Twelve hours, because this one has to outlive a working day rather than a
 * single redirect. The viewer hands it to pdf.js, which then re-requests the
 * SAME url for every byte range of every page for as long as the plan is open;
 * a link that expires mid-takeoff interrupts someone counting devices.
 */
export const VIEWER_URL_WINDOW_SECONDS = 12 * 60 * 60;

/**
 * When a viewer link minted now should start and stop being valid.
 *
 * ── Bucketed, and that is the entire point ───────────────────────────────────
 * Both ends are pinned to a fixed boundary so that every mint inside the same
 * window produces a BYTE-IDENTICAL url. That is not tidiness. The client holds
 * these in a React Query cache and the viewer reloads the document whenever the
 * url changes, so a url that differed on each mint would silently restart an
 * open plan every time the app refetched in the background — which it does on
 * window focus, meaning every alt-tab back to a takeoff.
 *
 * The SIGNING TIME has to be pinned as well as the expiry, which is the part
 * that is easy to miss: the signature covers X-Amz-Date, so bucketing only the
 * duration still yields a different url every second.
 *
 * Same reasoning as `storageTokenExpiry` in storageTokens.ts, and the same
 * consequence: real validity varies between one and two windows, never less
 * than the window promised.
 */
export function viewerUrlWindow(now: Date): {
  signingDate: Date;
  expiresIn: number;
} {
  const windowMs = VIEWER_URL_WINDOW_SECONDS * 1000;
  const start = Math.floor(now.getTime() / windowMs) * windowMs;
  return {
    signingDate: new Date(start),
    // Two windows from the pinned start, so a url minted at the very end of a
    // window is still good for a full window afterwards.
    expiresIn: VIEWER_URL_WINDOW_SECONDS * 2,
  };
}

/**
 * A long-lived signed link the viewer gives straight to pdf.js.
 *
 * ── Why this bypasses our own storage proxy ──────────────────────────────────
 * The proxy answers one request per byte range: pdf.js asks it, it verifies a
 * token, signs, and redirects to R2. That is a round trip through this server
 * for every slice of every page of a plan somebody is scrolling through. Handing
 * over a signed link once takes this server out of the loop entirely.
 *
 * ── What is given up, stated plainly ─────────────────────────────────────────
 * This is a bearer link: whoever holds it can read that one object until it
 * expires. That was already true of the proxy url it replaces — the change is
 * that the window is twelve hours rather than thirty minutes. Ownership is
 * still checked where the link is MINTED, and the link still opens exactly one
 * object and grants nothing else.
 *
 * Which is why a link like this must never be written down. It is returned to
 * the caller that asked and nowhere else: not logged, not stored in a column,
 * not put in the address bar. A signed url in a log file outlives the session
 * and is readable by anyone who can read logs.
 */
export async function r2ViewerUrl(key: string, now: Date): Promise<string> {
  const { client, config } = r2();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    viewerUrlWindow(now)
  );
}

/**
 * Whether R2 holds this key, remembered so the answer is asked for once.
 *
 * ── Why the cache is not optional ────────────────────────────────────────────
 * This exists to decide whether a read falls back to an older store, and pdf.js
 * re-requests the SAME url for every byte range while a document is open —
 * hundreds of times for one plan set. Without remembering, each of those would
 * cost a HEAD against R2, which is both slow and billable, to re-learn
 * something that cannot have changed.
 *
 * A "yes" is kept for the life of the process: the app never deletes or moves a
 * stored object, so an object that is in R2 stays in R2. A "no" is kept only
 * briefly, because a "no" CAN become a "yes" — that is exactly what an upload
 * does — and an over-long negative is how a plan somebody just attached comes
 * back as missing.
 */
const NEGATIVE_TTL_MS = 60 * 1000;
/** Bounded so a long-lived process cannot grow this without limit. */
const MAX_REMEMBERED = 5000;

const existence = new Map<string, { exists: boolean; expiresAt: number }>();

function rememberExistence(key: string, exists: boolean): void {
  if (existence.size >= MAX_REMEMBERED) existence.clear();
  existence.set(key, {
    exists,
    expiresAt: exists ? Infinity : Date.now() + NEGATIVE_TTL_MS,
  });
}

export async function r2ObjectExists(key: string): Promise<boolean> {
  const remembered = existence.get(key);
  if (remembered && remembered.expiresAt > Date.now()) return remembered.exists;

  const { client, config } = r2();
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key })
    );
    rememberExistence(key, true);
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404 || status === 403) {
      // 403 as well as 404: a token without ListBucket gets "forbidden" for an
      // object that is not there. Treating it as present would send the reader
      // to a signed URL that 404s, instead of to the store that has the file.
      rememberExistence(key, false);
      return false;
    }
    // A network blip or a bad credential is NOT "the file is not here". Saying
    // it was would silently route a live plan to a store that never had it.
    throw error;
  }
}

/** Drop the client and everything remembered. For tests that change the env. */
export function resetR2StorageForTests(): void {
  cachedClient = null;
  existence.clear();
}
