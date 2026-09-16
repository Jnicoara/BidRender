/**
 * Cutting a plan set into pieces, and knowing which are still owed.
 *
 * ── Why this is the most heavily pinned part of the upload ───────────────────
 * Getting this wrong does not produce an error. It produces a 1.5GB PDF that
 * completes, attaches, appears in the list, and is corrupt — because one piece
 * covered the wrong bytes or a piece that never arrived was counted as done.
 * An estimator then bids a job off a drawing that will not open, or worse, one
 * that opens with a page of garbage in the middle.
 *
 * The whole point of keeping this as arithmetic is that those cases can be
 * written down here rather than reproduced with a bad connection and a
 * gigabyte of test data.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_PARTS,
  MIN_PART_BYTES,
  MULTIPART_PART_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  fileIdentity,
  partRange,
  planParts,
  remainingPartNumbers,
  sameFile,
  shouldUseMultipart,
  uploadedBytes,
} from "../shared/multipartPlan";
import { MAX_PDF_BYTES } from "../shared/uploadLimits";

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

describe("deciding to send in pieces", () => {
  it("leaves an ordinary drawing on the simple path", () => {
    expect(shouldUseMultipart(2 * MiB)).toBe(false);
    expect(shouldUseMultipart(40 * MiB)).toBe(false);
  });

  it("sends a scanned set in pieces", () => {
    expect(shouldUseMultipart(300 * MiB)).toBe(true);
    expect(shouldUseMultipart(1.5 * GiB)).toBe(true);
  });

  it("switches over at the threshold, not before it", () => {
    expect(shouldUseMultipart(MULTIPART_THRESHOLD_BYTES)).toBe(false);
    expect(shouldUseMultipart(MULTIPART_THRESHOLD_BYTES + 1)).toBe(true);
  });
});

describe("cutting a file up", () => {
  it("uses the standard piece size for anything the app accepts", () => {
    // The guard that grows the piece size must not fire in normal use: a
    // non-standard size is harder to reason about and nothing needs one here.
    for (const size of [100 * MiB, 500 * MiB, GiB, MAX_PDF_BYTES]) {
      expect(planParts(size).partSize).toBe(MULTIPART_PART_BYTES);
    }
  });

  it("counts the pieces, with a short last one", () => {
    const plan = planParts(40 * MiB, 16 * MiB);
    expect(plan.partCount).toBe(3);
  });

  it("makes one piece of a file smaller than a piece", () => {
    expect(planParts(3 * MiB, 16 * MiB).partCount).toBe(1);
  });

  it("never plans more pieces than storage will accept", () => {
    // R2's ceiling. Well above anything the app allows, so this is a guard
    // rather than a working path — but a guard that fires as a clear larger
    // piece size beats an upload refused near the end for no stated reason.
    const huge = 500 * GiB;
    const plan = planParts(huge);
    expect(plan.partCount).toBeLessThanOrEqual(MAX_PARTS);
    expect(plan.partSize).toBeGreaterThan(MULTIPART_PART_BYTES);
  });

  it("never plans a piece under the minimum storage accepts", () => {
    expect(planParts(GiB, 1 * MiB).partSize).toBeGreaterThanOrEqual(
      MIN_PART_BYTES
    );
  });

  it("refuses a file with no bytes", () => {
    expect(() => planParts(0)).toThrow(/no bytes/i);
  });
});

describe("which bytes a piece carries", () => {
  const byteSize = 40 * MiB;
  const plan = planParts(byteSize, 16 * MiB);

  it("starts at the beginning and runs piece by piece", () => {
    expect(partRange(1, plan, byteSize)).toEqual({ start: 0, end: 16 * MiB });
    expect(partRange(2, plan, byteSize)).toEqual({
      start: 16 * MiB,
      end: 32 * MiB,
    });
  });

  it("stops the last piece at the end of the file", () => {
    expect(partRange(3, plan, byteSize)).toEqual({
      start: 32 * MiB,
      end: 40 * MiB,
    });
  });

  /**
   * The property that makes resuming safe: piece 34 is the same bytes whoever
   * sends it and whenever. A resumed upload cannot put a piece somewhere the
   * first attempt would not have.
   */
  it("covers every byte exactly once, with no gap and no overlap", () => {
    let covered = 0;
    let previousEnd = 0;
    for (let n = 1; n <= plan.partCount; n++) {
      const { start, end } = partRange(n, plan, byteSize);
      expect(start).toBe(previousEnd);
      covered += end - start;
      previousEnd = end;
    }
    expect(covered).toBe(byteSize);
    expect(previousEnd).toBe(byteSize);
  });

  it("refuses a piece number outside the file", () => {
    expect(() => partRange(0, plan, byteSize)).toThrow();
    expect(() => partRange(4, plan, byteSize)).toThrow();
  });
});

describe("resuming", () => {
  const byteSize = 100 * MiB;
  const plan = planParts(byteSize, 16 * MiB); // 7 pieces

  it("asks for everything when storage has nothing", () => {
    expect(remainingPartNumbers(plan, [])).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("asks only for what is missing", () => {
    expect(remainingPartNumbers(plan, [1, 2, 5])).toEqual([3, 4, 6, 7]);
  });

  it("asks for nothing when storage has it all", () => {
    expect(remainingPartNumbers(plan, [1, 2, 3, 4, 5, 6, 7])).toEqual([]);
  });

  /**
   * Pieces arrive in whatever order the network allows, so the list storage
   * gives back is not sorted and must not need to be.
   */
  it("does not care what order storage lists them in", () => {
    expect(remainingPartNumbers(plan, [5, 1, 2])).toEqual([3, 4, 6, 7]);
  });

  it("starts the progress bar where the last attempt stopped", () => {
    // Three whole pieces already in storage.
    expect(uploadedBytes(plan, [1, 2, 3], byteSize)).toBe(48 * MiB);
  });

  it("counts the short last piece at its real length", () => {
    // Piece 7 is the remainder, not a whole 16MB.
    expect(uploadedBytes(plan, [7], byteSize)).toBe(byteSize - 6 * 16 * MiB);
  });

  it("ignores a piece number storage should not have reported", () => {
    expect(uploadedBytes(plan, [1, 99], byteSize)).toBe(16 * MiB);
  });
});

describe("recognising the same file again", () => {
  const file = { name: "Scanned set.pdf", size: 900 * MiB, lastModified: 1000 };

  it("matches the identical file", () => {
    expect(sameFile(fileIdentity(file), fileIdentity(file))).toBe(true);
  });

  /**
   * The case this exists to prevent: picking a re-exported version of the same
   * drawing set and having its bytes stitched onto the previous one's pieces.
   * A re-export changes the modified time, and almost always the size too.
   */
  it("refuses a newer export of the same drawing set", () => {
    expect(
      sameFile(
        fileIdentity(file),
        fileIdentity({ ...file, lastModified: 2000 })
      )
    ).toBe(false);
    expect(
      sameFile(fileIdentity(file), fileIdentity({ ...file, size: 901 * MiB }))
    ).toBe(false);
  });

  it("refuses a different file of the same size", () => {
    expect(
      sameFile(fileIdentity(file), fileIdentity({ ...file, name: "Other.pdf" }))
    ).toBe(false);
  });
});

describe("the pieces and the size limit agree", () => {
  it("can carry the largest file the app accepts", () => {
    const plan = planParts(MAX_PDF_BYTES);
    expect(plan.partCount).toBeLessThanOrEqual(MAX_PARTS);
    // Sanity on the headline number: 2GB in 16MB pieces.
    expect(plan.partCount).toBe(128);
  });

  it("sends anything over the threshold in pieces, up to the limit", () => {
    expect(shouldUseMultipart(MAX_PDF_BYTES)).toBe(true);
  });
});
