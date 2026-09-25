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
  PDF_WHOLE_DOWNLOAD_LIMIT_BYTES,
  pdfRangeLoadOptions,
  shouldDisableAutoFetch,
  wholeDownloadAllowed,
  wholeDownloadRefusal,
} from "@shared/pdfRangeLoading";
import { MAX_PDF_BYTES } from "@shared/uploadLimits";

const MB = 1024 * 1024;

const BASE = "http://localhost:3000/src/workers/pdfRenderer.worker.ts";

describe("fetching by byte range", () => {
  it("always leaves ranges and streaming on", () => {
    // Without these pdf.js downloads the document before drawing anything,
    // which is what made a large set unusable in the first place.
    const options = pdfRangeLoadOptions(
      "https://bucket.example/plan.pdf",
      MB,
      BASE
    );
    expect(options.disableRange).toBe(false);
    expect(options.disableStream).toBe(false);
  });

  it("uses a one-megabyte request chunk", () => {
    expect(PDF_RANGE_CHUNK_BYTES).toBe(1024 * 1024);
  });

  /**
   * THE test for the fault fixed on 2026-09-25. pdf.js resolves a STRING url
   * against `window.location`, which does not exist in the worker these
   * options are used in — so a string made every open throw, and the viewer
   * silently downloaded every plan whole. The test that stood here before
   * asserted the url was "passed through untouched", which pinned the bug in
   * place. A URL object is what pdf.js reads without touching `window`.
   */
  it("hands pdf.js a URL object, never a string", () => {
    const options = pdfRangeLoadOptions("/manus-storage/t/k.pdf", MB, BASE);
    expect(options.url).toBeInstanceOf(URL);
    expect(typeof options.url).not.toBe("string");
  });

  it("resolves a relative storage url against the worker's own address", () => {
    const options = pdfRangeLoadOptions(
      "/manus-storage/abc.def/bid-plans/1/2/big500.pdf",
      MB,
      BASE
    );
    expect(options.url.href).toBe(
      "http://localhost:3000/manus-storage/abc.def/bid-plans/1/2/big500.pdf"
    );
  });

  it("leaves an absolute signed url exactly as it was", () => {
    const url = "https://bucket.example/plan.pdf?X-Amz-Signature=abc";
    expect(pdfRangeLoadOptions(url, MB, BASE).url.href).toBe(url);
  });
});

describe("the whole-download fallback", () => {
  it("allows an ordinary drawing", () => {
    expect(wholeDownloadAllowed(5 * MB)).toBe(true);
    expect(wholeDownloadAllowed(PDF_WHOLE_DOWNLOAD_LIMIT_BYTES)).toBe(true);
  });

  it("refuses a large set rather than pulling it down whole", () => {
    expect(wholeDownloadAllowed(PDF_WHOLE_DOWNLOAD_LIMIT_BYTES + 1)).toBe(
      false
    );
    expect(wholeDownloadAllowed(270 * MB)).toBe(false);
    expect(wholeDownloadAllowed(MAX_PDF_BYTES)).toBe(false);
  });

  it("lets an unknown size through, because the read itself is capped", () => {
    // See readCapped in lib/cappedDownload.ts, tested alongside.
    expect(wholeDownloadAllowed(null)).toBe(true);
  });

  it("says the size and that the takeoff is safe", () => {
    const message = wholeDownloadRefusal(270 * MB);
    expect(message).toContain("270 MB");
    expect(message).toContain("takeoff is saved");
    expect(wholeDownloadRefusal(null)).not.toContain("null");
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
      pdfRangeLoadOptions("https://bucket.example/plan.pdf", 10 * MB, BASE)
        .disableAutoFetch
    ).toBe(false);
    expect(
      pdfRangeLoadOptions("https://bucket.example/plan.pdf", 800 * MB, BASE)
        .disableAutoFetch
    ).toBe(true);
  });

  it("sits well below the size at which a set is called large", () => {
    // This is not a "large file" warning threshold — it is the point where
    // prefetching costs more than it returns, which comes much earlier.
    expect(PDF_AUTOFETCH_LIMIT_BYTES).toBeLessThan(MAX_PDF_BYTES / 4);
  });
});
