/**
 * A-S13 — AN UPLOAD'S SIZE IS DECLARED, NOT ENFORCED. Prepared, NOT wired.
 * Plan: references/a-s13-upload-size-plan.md.
 *
 * Today the browser declares `byteSize` to `createUploadTicket` /
 * `createMultipartUpload`, the server checks the NUMBER against
 * MAX_PDF_BYTES, and then signs a PUT that binds only `host` (measured
 * 2026-10-15: `X-Amz-SignedHeaders=host`). The body sent on that URL can be
 * any size, and `confirmAttach` records whatever size the caller states.
 *
 * Two independent closes, both here and both tested without a bucket:
 *
 * 1. **Bind the size into the signature** — `ContentLength` on the command
 *    puts `content-length` into the signed headers (measured: it does, for a
 *    PUT and for an upload piece). A body of any other length then no longer
 *    matches the signature. Whether R2 REFUSES that is the part only a real
 *    bucket can answer; it is the first proof in the plan, on staging.
 * 2. **Check what actually landed** — `verifyUploadedSize` asks the store
 *    for the object's real size at attach time and refuses (and deletes) an
 *    object that is not exactly what was declared. Needs no R2 behaviour
 *    beyond a HEAD, which `r2ObjectExists` already makes.
 *
 * Nothing calls these yet. Wiring them into `r2PresignPut`, `signParts` and
 * `confirmAttach` is the plan's step 2, after the staging proof — a wrong
 * guess about R2 here breaks every plan upload on live.
 */
import { MAX_PDF_BYTES } from "../shared/uploadLimits";
import { partRange, planParts } from "../shared/multipartPlan";

/** The PutObject input with the declared size bound in. */
export function boundPutInput(input: {
  bucket: string;
  key: string;
  contentType: string;
  byteSize: number;
}) {
  return {
    Bucket: input.bucket,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.byteSize,
  };
}

/**
 * The exact length of one piece of a file of `byteSize`, by the same cut the
 * browser makes (shared/multipartPlan.ts) — every piece full but the last.
 */
export function boundPartLength(partNumber: number, byteSize: number): number {
  const range = partRange(partNumber, planParts(byteSize), byteSize);
  return range.end - range.start;
}

/** The UploadPart input with that piece's exact length bound in. */
export function boundPartInput(input: {
  bucket: string;
  key: string;
  uploadId: string;
  partNumber: number;
  byteSize: number;
}) {
  return {
    Bucket: input.bucket,
    Key: input.key,
    UploadId: input.uploadId,
    PartNumber: input.partNumber,
    ContentLength: boundPartLength(input.partNumber, input.byteSize),
  };
}

export type UploadSizeProblem = {
  code: "missing" | "different" | "overMax";
  message: string;
};

/**
 * Whether what landed is what was declared. Exact, in both directions: a
 * BIGGER object is the abuse (storage paid for and never checked), a SMALLER
 * one is a cut-off transfer that would open as a broken plan set.
 */
export function uploadSizeProblem(
  declared: number,
  actual: number | null,
  max: number = MAX_PDF_BYTES
): UploadSizeProblem | null {
  if (actual === null)
    return {
      code: "missing",
      message: "The upload did not arrive. Try sending the file again.",
    };
  if (actual > max)
    return {
      code: "overMax",
      message: "That file is larger than BidRidge accepts.",
    };
  if (actual !== declared)
    return {
      code: "different",
      message:
        "The file that arrived is not the size that was sent. Try sending it again.",
    };
  return null;
}

/** What `verifyUploadedSize` needs from a store — HEAD and delete. */
export type SizedStore = {
  sizeOf(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
};

/**
 * Ask the store what actually landed under `key`. A refused object is
 * deleted on the spot — nothing will ever name it, and leaving it is the
 * storage cost this exists to stop.
 */
export async function verifyUploadedSize(
  store: SizedStore,
  key: string,
  declared: number,
  max: number = MAX_PDF_BYTES
): Promise<UploadSizeProblem | null> {
  const problem = uploadSizeProblem(declared, await store.sizeOf(key), max);
  if (problem && problem.code !== "missing") await store.delete(key);
  return problem;
}
