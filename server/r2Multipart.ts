/**
 * Sending one large plan set to R2 in pieces.
 *
 * ── What this file is and is not ─────────────────────────────────────────────
 * It starts an upload, signs a URL for each piece, finishes it, abandons it, and
 * asks R2 what it already holds. The BYTES never come here: the browser sends
 * every piece straight to R2 on a signed URL, exactly as the single-PUT path
 * does. This server only ever handles permission.
 *
 * That is the whole reason a 2GB plan set is possible. Nothing is buffered in
 * this process, no request body limit applies, and an upload that takes twenty
 * minutes does not hold a server request open for twenty minutes.
 *
 * ── Resuming is R2's memory, not ours ────────────────────────────────────────
 * `listUploadedParts` asks R2 which pieces arrived. That is deliberately the
 * only source of truth for resuming. A local record of "pieces I believe I
 * sent" is wrong in precisely the case that matters — the connection died
 * mid-piece — and a wrong record produces a file that completes and is corrupt,
 * which is far worse than one that fails.
 *
 * ── Signed URLs are handed out; they are never written down ──────────────────
 * Nothing here logs a signed URL, stores one, or returns one to anywhere but
 * the caller that asked. A signed URL is a bearer credential for one object:
 * in a log file it outlives the session and is readable by anyone with the log.
 */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client } from "./r2Storage";

/**
 * How long a piece's signed URL is good for.
 *
 * Generous because these are minted in batches ahead of being used: a slow
 * connection may not reach piece 120 for a quarter of an hour after it was
 * signed, and a URL that expires in the queue turns a healthy upload into a
 * failure with a confusing cause.
 */
const PART_URL_WINDOW_SECONDS = 6 * 60 * 60;

/**
 * The most pieces that may be signed in one request.
 *
 * Signing is cheap but not free, and an unbounded batch is a way for one caller
 * to make this server do a lot of work with one small request. The client asks
 * for pieces as it needs them.
 */
export const MAX_PARTS_PER_SIGN_REQUEST = 64;

/** Begin an upload. Returns the id every later call needs. */
export async function createMultipartUpload(
  key: string,
  contentType: string
): Promise<string> {
  const { client, config } = r2Client();
  const result = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
    })
  );
  if (!result.UploadId) {
    throw new Error("Storage did not return an upload id.");
  }
  return result.UploadId;
}

/**
 * Signed URLs for these pieces.
 *
 * Piece numbers are 1-based and are R2's own numbering, so nothing in the app
 * has to translate between two schemes — see shared/multipartPlan.ts.
 */
export async function signParts(
  key: string,
  uploadId: string,
  partNumbers: readonly number[]
): Promise<{ partNumber: number; url: string }[]> {
  const { client, config } = r2Client();
  return Promise.all(
    partNumbers.map(async partNumber => ({
      partNumber,
      url: await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: config.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: PART_URL_WINDOW_SECONDS }
      ),
    }))
  );
}

/** A piece R2 has, and the receipt proving which bytes it was. */
export type UploadedPart = { partNumber: number; etag: string };

/**
 * Which pieces R2 already holds for this upload.
 *
 * Paged through to the end rather than reading the first page: a 2GB set is
 * 128 pieces, which fits in one page today, but a resumed upload that silently
 * saw only the first 1,000 of a longer list would re-send pieces it did not
 * need to and, worse, would look like it worked.
 */
export async function listUploadedParts(
  key: string,
  uploadId: string
): Promise<UploadedPart[]> {
  const { client, config } = r2Client();
  const parts: UploadedPart[] = [];
  let marker: number | undefined;

  do {
    const page = await client.send(
      new ListPartsCommand({
        Bucket: config.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: marker === undefined ? undefined : String(marker),
      })
    );
    for (const part of page.Parts ?? []) {
      if (part.PartNumber === undefined || !part.ETag) continue;
      parts.push({ partNumber: part.PartNumber, etag: part.ETag });
    }
    marker = page.IsTruncated
      ? Number(page.NextPartNumberMarker ?? 0) || undefined
      : undefined;
  } while (marker !== undefined);

  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

/**
 * Stitch the pieces into the finished object.
 *
 * The receipts must be in piece order — R2 assembles the file in the order
 * given, so an out-of-order list produces a scrambled PDF rather than an error.
 * Sorted here rather than trusted from the caller, because the caller is a
 * browser that finished its pieces in whatever order the network allowed.
 */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: readonly UploadedPart[]
): Promise<void> {
  const { client, config } = r2Client();
  const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: config.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: ordered.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    })
  );
}

/**
 * Throw away an unfinished upload's pieces.
 *
 * ── Why this is worth doing even though the bucket cleans up anyway ──────────
 * The pieces of an unfinished upload do NOT appear in a listing of the bucket
 * but DO cost storage. Without the bucket's 7-day abort rule they would pile up
 * invisibly; with it, they cost a week of storage each. This call makes a
 * cancel immediate instead.
 *
 * Failure is swallowed on purpose. The rule is the guarantee, this is the
 * courtesy, and a cancel that reports an error because the tidying-up failed
 * would be telling the user about a problem that is not theirs and that has
 * already been handled.
 */
export async function abortMultipartUpload(
  key: string,
  uploadId: string
): Promise<void> {
  const { client, config } = r2Client();
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: config.bucket,
      Key: key,
      UploadId: uploadId,
    })
  );
}
