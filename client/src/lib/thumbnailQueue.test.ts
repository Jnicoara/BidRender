/**
 * Which thumbnail is drawn next. The fault this replaced: page order, so the
 * sheet you scrolled to waited behind every sheet above it — about four
 * minutes for sheet 400 of a 500-sheet set, at ~0.6s a thumbnail.
 */
import { describe, expect, it } from "vitest";
import { nextThumbnail, thumbnailWants } from "@/lib/thumbnailQueue";

describe("thumbnailWants", () => {
  it("puts the visible sheets first, even deep in a big set", () => {
    const wants = thumbnailWants([{ first: 400, last: 405 }], 500, 2);
    expect(wants.slice(0, 6)).toEqual([400, 401, 402, 403, 404, 405]);
    expect(wants).not.toContain(1);
  });

  it("then the neighbours, nearest first, below before above", () => {
    const wants = thumbnailWants([{ first: 400, last: 405 }], 500, 2);
    expect(wants.slice(6)).toEqual([406, 399, 407, 398]);
  });

  it("wants nothing when nothing is on screen", () => {
    // § 4a: thumbnails are drawn only while something is showing them.
    expect(thumbnailWants([null, null], 500)).toEqual([]);
    expect(thumbnailWants([], 500)).toEqual([]);
  });

  it("stays inside the set", () => {
    expect(thumbnailWants([{ first: 1, last: 2 }], 3, 5)).toEqual([1, 2, 3]);
    expect(thumbnailWants([{ first: 498, last: 510 }], 500, 1)).toEqual([
      498, 499, 500, 497,
    ]);
  });

  it("serves the first range before the second, without repeats", () => {
    const wants = thumbnailWants(
      [
        { first: 10, last: 11 },
        { first: 11, last: 12 },
      ],
      500,
      0
    );
    expect(wants).toEqual([10, 11, 12]);
  });

  it("copes with a range reported backwards", () => {
    expect(thumbnailWants([{ first: 5, last: 3 }], 10, 0)).toEqual([3, 4, 5]);
  });
});

describe("nextThumbnail", () => {
  it("skips what is already drawn", () => {
    expect(nextThumbnail([400, 401, 402], new Set([400, 401]))).toBe(402);
  });

  it("is null when everything wanted is done", () => {
    expect(nextThumbnail([1, 2], new Set([1, 2]))).toBeNull();
    expect(nextThumbnail([], new Set())).toBeNull();
  });
});
