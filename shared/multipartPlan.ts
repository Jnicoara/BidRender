/**
 * Cutting a large plan set into pieces, and working out which are still owed.
 *
 * ── Why a plan set is sent in pieces at all ──────────────────────────────────
 * One PUT of a 1GB file is a single request that either finishes or is worth
 * nothing. An estimator on a site connection loses it at 90% and starts again
 * from zero, which for a scanned set is twenty minutes gone. Pieces turn that
 * into losing 16MB.
 *
 * ── The pieces are all the same size, and that is a rule, not a choice ───────
 * R2 requires every piece except the LAST to be exactly the same size. That is
 * stricter than S3, which tolerates a ragged set, and it is the constraint that
 * shapes this file: a piece number maps to a byte range by arithmetic alone.
 *
 * That is what makes resuming cheap and safe. R2 already knows which pieces it
 * received, so resuming is "ask what arrived, send the rest" — and because
 * piece 34 always covers the same bytes, a piece sent by a resumed upload
 * cannot land in a different place from the one the first attempt would have
 * sent. Nothing has to be remembered correctly for the file to come out right.
 *
 * ── Everything here is arithmetic ────────────────────────────────────────────
 * No network, no browser API, no clock. The upload path is the hardest part of
 * this app to exercise for real — it needs a bad connection and a large file —
 * so as much of it as possible is made into functions that can simply be
 * checked at a desk.
 */

const MiB = 1024 * 1024;

/**
 * Below this, one ordinary PUT.
 *
 * Multipart costs three extra round trips (start, finish, and signing) and a
 * record to clean up. Under about a minute of transfer that overhead is worse
 * than the interruption it protects against, and the plain path is the one
 * that has been carrying uploads all along.
 */
export const MULTIPART_THRESHOLD_BYTES = 64 * MiB;

/**
 * How big each piece is.
 *
 * 16MB is a compromise between two costs that pull opposite ways: a smaller
 * piece means more requests and more signing, a larger one means more to resend
 * when a piece fails and more memory held per piece in flight. At 16MB a 2GB
 * set is 128 pieces, and a failure costs seconds rather than minutes.
 */
export const MULTIPART_PART_BYTES = 16 * MiB;

/** R2 will not accept a non-final piece under this. */
export const MIN_PART_BYTES = 5 * MiB;

/** R2 will not accept more pieces than this for one upload. */
export const MAX_PARTS = 10_000;

/**
 * How many pieces are in the air at once.
 *
 * Four saturates an ordinary connection without putting 16MB × lots into the
 * tab's memory at the same time, and leaves room for the browser to be doing
 * something else — this app is used with the plan viewer open beside it.
 */
export const UPLOAD_CONCURRENCY = 4;

/** Is this file big enough to be worth sending in pieces? */
export function shouldUseMultipart(byteSize: number): boolean {
  return byteSize > MULTIPART_THRESHOLD_BYTES;
}

export type PartPlan = {
  /** Bytes in every piece but the last. */
  partSize: number;
  /** How many pieces the file becomes. */
  partCount: number;
};

/**
 * How to cut a file of this size.
 *
 * Grows the piece size when the standard one would need more pieces than R2
 * allows, rather than failing. At 16MB the ceiling is 160GB, far above anything
 * the app accepts, so this is a guard that should never fire — but a guard that
 * never fires is cheaper than the alternative, which is an upload that gets
 * most of the way and is then refused for a reason no message explains.
 */
export function planParts(
  byteSize: number,
  preferredPartSize: number = MULTIPART_PART_BYTES
): PartPlan {
  if (byteSize <= 0) {
    throw new Error("A file with no bytes cannot be cut into pieces.");
  }

  let partSize = Math.max(preferredPartSize, MIN_PART_BYTES);
  if (Math.ceil(byteSize / partSize) > MAX_PARTS) {
    // Round up to a whole MiB so the number stays a tidy one in logs and tests.
    partSize = Math.ceil(byteSize / MAX_PARTS / MiB) * MiB;
  }

  return { partSize, partCount: Math.ceil(byteSize / partSize) };
}

/**
 * The bytes piece `partNumber` carries. Piece numbers are 1-based, as R2 has
 * them, so that nothing has to convert between two numbering schemes.
 *
 * `end` is exclusive, matching how a file is sliced in the browser.
 */
export function partRange(
  partNumber: number,
  plan: PartPlan,
  byteSize: number
): { start: number; end: number } {
  if (partNumber < 1 || partNumber > plan.partCount) {
    throw new Error(
      `Piece ${partNumber} is not part of a file cut into ${plan.partCount}.`
    );
  }
  const start = (partNumber - 1) * plan.partSize;
  return { start, end: Math.min(start + plan.partSize, byteSize) };
}

/**
 * Which pieces still have to be sent.
 *
 * Takes what R2 says it already holds — not a local record of what was sent.
 * A piece the browser believes it sent but that did not survive is exactly the
 * case this has to get right, and only one of those two sources was actually
 * there when it happened.
 */
export function remainingPartNumbers(
  plan: PartPlan,
  uploadedPartNumbers: readonly number[]
): number[] {
  const done = new Set(uploadedPartNumbers);
  const remaining: number[] = [];
  for (let n = 1; n <= plan.partCount; n++) {
    if (!done.has(n)) remaining.push(n);
  }
  return remaining;
}

/**
 * How much of the file the pieces already in R2 account for.
 *
 * Used to start a resumed upload's progress bar in the right place, so it
 * continues from where it stopped instead of appearing to begin again.
 */
export function uploadedBytes(
  plan: PartPlan,
  uploadedPartNumbers: readonly number[],
  byteSize: number
): number {
  return uploadedPartNumbers
    .filter(n => n >= 1 && n <= plan.partCount)
    .reduce((total, n) => {
      const { start, end } = partRange(n, plan, byteSize);
      return total + (end - start);
    }, 0);
}

/**
 * Enough about a chosen file to recognise it again later.
 *
 * ── Why this is needed at all ────────────────────────────────────────────────
 * A page that reloads loses its handle on the file. The browser will not hand
 * it back without the user choosing it again, for good reasons, so a resumed
 * upload after a reload has to confirm that the file just picked is the same
 * file the unfinished pieces came from.
 *
 * Name, size and modified-time is not a checksum and is not claimed to be one.
 * Reading a gigabyte to hash it before resuming would cost most of what
 * resuming saves. What it does do is make an ACCIDENT — picking last week's
 * revision of the same drawing set — almost impossible to get wrong silently,
 * because a re-exported PDF differs in all three.
 */
export type FileIdentity = {
  name: string;
  size: number;
  lastModified: number;
};

export function fileIdentity(file: {
  name: string;
  size: number;
  lastModified: number;
}): FileIdentity {
  return { name: file.name, size: file.size, lastModified: file.lastModified };
}

export function sameFile(a: FileIdentity, b: FileIdentity): boolean {
  return (
    a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
  );
}
