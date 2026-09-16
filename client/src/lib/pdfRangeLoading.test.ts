/**
 * How pdf.js is told to fetch a plan, and when it stops prefetching the rest.
 *
 * The decision being pinned here is worth a gigabyte. With the background
 * download left on, opening a 1GB scanned set quietly pulls the whole file down
 * while the estimator waits for one page — on a laptop tethered to a phone, at
 * a supply house, against a deadline.
 */
import { describe, it, expect } from "vitest";
import {
  PDF_AUTOFETCH_LIMIT_BYTES,
  PDF_RANGE_CHUNK_BYTES,
  pdfRangeLoadOptions,
  shouldDisableAutoFetch,
} from "@shared/pdfRangeLoading";
import { MAX_PDF_BYTES } from "@shared/uploadLimits";

const MB = 1024 * 1024;

describe("fetching by byte range", () => {
  it("always leaves ranges and streaming on", () => {
    // Without these pdf.js downloads the document before drawing anything,
    // which is what made a large set unusable in the first place.
    const options = pdfRangeLoadOptions("https://bucket.example/plan.pdf", MB);
    expect(options.disableRange).toBe(false);
    expect(options.disableStream).toBe(false);
  });

  it("uses a one-megabyte request chunk", () => {
    expect(PDF_RANGE_CHUNK_BYTES).toBe(1024 * 1024);
  });

  it("passes the url through untouched", () => {
    const url = "https://bucket.example/plan.pdf?X-Amz-Signature=abc";
    expect(pdfRangeLoadOptions(url, MB).url).toBe(url);
  });
});

describe("the background download", () => {
  it("stays on for an ordinary drawing", () => {
    // Under the threshold the whole file lands in seconds and every later page
    // is then instant. Turning it off here would trade a real benefit for
    // nothing.
    expect(shouldDisableAutoFetch(5 * MB)).toBe(false);
    expect(shouldDisableAutoFetch(40 * MB)).toBe(false);
  });

  it("goes off for a large scanned set", () => {
    expect(shouldDisableAutoFetch(300 * MB)).toBe(true);
    expect(shouldDisableAutoFetch(MAX_PDF_BYTES)).toBe(true);
  });

  it("switches at the threshold, not before it", () => {
    expect(shouldDisableAutoFetch(PDF_AUTOFETCH_LIMIT_BYTES)).toBe(false);
    expect(shouldDisableAutoFetch(PDF_AUTOFETCH_LIMIT_BYTES + 1)).toBe(true);
  });

  /**
   * An unknown size is an older sheet recorded before the app stored one.
   * Erring toward fetching only what is needed costs a page load; erring the
   * other way costs a gigabyte of somebody's tethered connection.
   */
  it("errs toward fetching less when the size is unknown", () => {
    expect(shouldDisableAutoFetch(null)).toBe(true);
  });

  it("is reflected in the options handed to pdf.js", () => {
    expect(
      pdfRangeLoadOptions("https://bucket.example/plan.pdf", 10 * MB)
        .disableAutoFetch
    ).toBe(false);
    expect(
      pdfRangeLoadOptions("https://bucket.example/plan.pdf", 800 * MB)
        .disableAutoFetch
    ).toBe(true);
  });

  it("sits well below the size at which a set is called large", () => {
    // This is not a "large file" warning threshold — it is the point where
    // prefetching costs more than it returns, which comes much earlier.
    expect(PDF_AUTOFETCH_LIMIT_BYTES).toBeLessThan(MAX_PDF_BYTES / 4);
  });
});
