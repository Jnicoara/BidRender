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

/**
 * The options handed to pdf.js's `getDocument`.
 *
 * ── `url` is a URL OBJECT, resolved here, and that is the whole fix ──────────
 * pdf.js 5 turns a STRING url into an absolute one with
 * `URL.parse(val, window.location)`. This runs inside a Web Worker, which has
 * no `window`, so every string threw `ReferenceError: window is not defined`.
 * The viewer caught that and fell back to downloading the whole file. So from
 * the day range loading was added (2026-08-15) until 2026-09-25, every plan
 * was downloaded whole before it drew: 270MB for a 500-sheet set, with nothing
 * on screen or in the console to say so. A `URL` object skips that branch
 * entirely (`getUrlProp` returns `val.href`).
 *
 * `base` is where a relative url resolves from: `self.location.href` in the
 * worker. The disk-storage url is `/manus-storage/...`, which is relative,
 * and an R2 url is absolute and ignores the base.
 * references/plan-viewer-overhaul.md § 17.2 has the measurements.
 */
export function pdfRangeLoadOptions(
  url: string,
  byteSize: number | null,
  base: string
) {
  return {
    url: new URL(url, base),
    rangeChunkSize: PDF_RANGE_CHUNK_BYTES,
    disableRange: false,
    disableStream: false,
    disableAutoFetch: shouldDisableAutoFetch(byteSize),
  } as const;
}

/**
 * The most the viewer will download WHOLE when byte ranges fail.
 *
 * The whole-file path is a fallback for storage that cannot serve ranges. It
 * had no ceiling at all, which is how a broken range loader went unnoticed:
 * every plan quietly came down whole, whatever its size. Above this, the
 * fallback refuses and says why instead of pulling a gigabyte over somebody's
 * tethered phone.
 *
 * The same number as the background-download threshold, for the same reason.
 * Below it pdf.js fetches the whole file anyway, so a whole download costs
 * nothing extra. Above it, a whole download is the thing range loading exists
 * to avoid.
 */
export const PDF_WHOLE_DOWNLOAD_LIMIT_BYTES = PDF_AUTOFETCH_LIMIT_BYTES;

/**
 * May the fallback download this file whole?
 *
 * `size` is the best size known: the one recorded at upload, or else the
 * response's Content-Length. Unknown is allowed, because the download is then
 * read against the limit as it arrives (`readCapped` in the client) and stops
 * the moment it passes it.
 */
export function wholeDownloadAllowed(size: number | null): boolean {
  if (size === null) return true;
  return size <= PDF_WHOLE_DOWNLOAD_LIMIT_BYTES;
}

/** What the viewer says when it refuses. */
export function wholeDownloadRefusal(size: number | null): string {
  const mb = size === null ? null : Math.round(size / (1024 * 1024));
  return (
    `This plan${mb === null ? "" : ` is ${mb} MB and`} could not be read a piece at a time, ` +
    `so it was not downloaded whole. Your takeoff is saved — try opening it again.`
  );
}
