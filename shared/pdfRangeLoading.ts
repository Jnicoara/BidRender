/**
 * How pdf.js is told to fetch a plan.
 *
 * ── Ranges, always ───────────────────────────────────────────────────────────
 * pdf.js asks storage for byte ranges rather than downloading the document and
 * then reading it, so a 1GB sheet set never has to be resident in tab memory
 * before the first sheet can be drawn.
 *
 * ── The background download, and why it is switched off for big sets ─────────
 * By default pdf.js does BOTH: it fetches the ranges it needs to draw what you
 * are looking at, and it quietly downloads the rest of the file in the
 * background so that later pages are already there.
 *
 * On an ordinary drawing that is a good trade — the whole file arrives in a few
 * seconds and page-flipping is then instant. On a 1GB scanned set it is a
 * gigabyte nobody asked for, competing for the same connection as the pages the
 * estimator is actually trying to look at, on a laptop tethered to a phone.
 *
 * So above a threshold it is turned off and pdf.js fetches only what is on
 * screen. The cost is real and worth stating: jumping to a page you have not
 * visited fetches it then, so there is a brief load where there would have been
 * none. On a set that size that is a far better deal than waiting for the whole
 * thing — and on a set below the threshold, nothing changes.
 */

/**
 * Keep each byte-range request modest enough for large architectural sets while
 * avoiding hundreds of tiny requests.
 */
export const PDF_RANGE_CHUNK_BYTES = 1024 * 1024;

/**
 * Above this, stop pdf.js downloading the rest of the document in the
 * background.
 *
 * 50MB is about where the background download stops being free. Below it, the
 * whole file lands in a few seconds on any connection an estimator is likely to
 * have, and having it there makes every later page instant. Above it, the
 * download is measured in minutes and is competing with the page being drawn.
 *
 * Deliberately well under the size at which a set becomes uncomfortable — this
 * is not a "large file" warning threshold, it is the point where prefetching
 * the whole document costs more than it returns.
 */
export const PDF_AUTOFETCH_LIMIT_BYTES = 50 * 1024 * 1024;

export function shouldDisableAutoFetch(byteSize: number | null): boolean {
  // Unknown size errs toward fetching only what is needed: the sets whose size
  // the app does not know are the legacy ones, and being wrong in this
  // direction costs a page load rather than a gigabyte.
  if (byteSize === null) return true;
  return byteSize > PDF_AUTOFETCH_LIMIT_BYTES;
}

export function pdfRangeLoadOptions(
  url: string,
  byteSize: number | null = null
) {
  return {
    url,
    rangeChunkSize: PDF_RANGE_CHUNK_BYTES,
    disableRange: false,
    disableStream: false,
    disableAutoFetch: shouldDisableAutoFetch(byteSize),
  } as const;
}
