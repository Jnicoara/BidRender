/**
 * How big a plan PDF may be, and what to say when it is not.
 *
 * ── One number, both sides ───────────────────────────────────────────────────
 * The client refuses an oversized file before spending minutes uploading it,
 * and the server refuses it again because a client check is a courtesy and not
 * a control. Those two checks must agree, so the number lives here rather than
 * being written down twice — the previous pair drifted apart the moment either
 * moved.
 *
 * ── Why 500MB ────────────────────────────────────────────────────────────────
 * The number tracks what a real plan set weighs, not what feels tidy.
 *
 *   Vector set, 100 sheets, architectural + MEP      20 – 80MB
 *   SCANNED set, 300dpi colour, same size            200 – 600MB
 *   Big commercial package with addenda              can pass 500MB
 *
 * Scanned sets are the case that matters. They are what an estimator receives
 * from a general contractor who printed and re-scanned the drawings, they are
 * the single most common large file in this trade, and the previous 150MB
 * ceiling turned a good number of them away — the same mistake the 30MB ceiling
 * made before it, one order of magnitude up.
 *
 * It also sits sensibly against comparable tools, which is the check on whether
 * a number is realistic or merely generous: Procore and Autodesk Construction
 * Cloud accept multi-gigabyte files, Bluebeam Studio and PlanGrid land around
 * 1GB per document, and the takeoff-focused tools sit in the mid hundreds of
 * megabytes. 500MB puts BidRender in that last group rather than at the bottom
 * of it, without pretending to be a document management system.
 *
 * ── And why not "no limit" ───────────────────────────────────────────────────
 * An unbounded upload is a way to fill a bucket by accident or on purpose, and
 * there is no honest error to show once it has happened. A bound that is
 * generous and enforced beats no bound.
 *
 * ── The limit is not the only ceiling, and never was ─────────────────────────
 * Raising this number alone moves a figure on screen. It did last time: the
 * 30MB → 150MB change had to route the bytes around a 32 MiB platform request
 * limit before the new number meant anything (see bidPdfsRouter's header). Two
 * ceilings sit above this one today and both are outside this file:
 *
 *   • the transport — the browser PUTs straight to storage, so whatever sits
 *     between them governs what actually completes;
 *   • the VIEWER — TakeoffPage reads the whole document into an ArrayBuffer
 *     before handing it to pdfjs, so a file this size is fully resident in tab
 *     memory. Ranged loading is the fix and is not built yet.
 *
 * Both are tracked as follow-ups. This constant is what the app PROMISES to
 * accept; it is worth nothing on its own.
 */

/** Largest plan PDF the app accepts. */
export const MAX_PDF_BYTES = 500 * 1024 * 1024;

/**
 * Above this, the document is accepted but the viewer is likely to struggle.
 *
 * Not a refusal — a file between this and MAX_PDF_BYTES uploads and attaches
 * normally. It exists so the app can SAY something before an estimator watches
 * a 400MB scan take the tab down, rather than presenting a limit that implies
 * everything under it opens comfortably. Honest about a real constraint beats
 * silence followed by a crash.
 */
export const VIEWER_COMFORTABLE_BYTES = 150 * 1024 * 1024;

/** Human-readable size, matching how the UI prints every other file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  // Whole numbers for round limits ("150MB"), one decimal for real files.
  return Number.isInteger(mb) ? `${mb}MB` : `${mb.toFixed(1)}MB`;
}

/** The first bytes of every PDF. Used to catch a file that is not one. */
export const PDF_MAGIC = "%PDF-";

export type UploadRejection = { ok: false; message: string };
export type UploadAcceptance = { ok: true };
export type UploadCheck = UploadRejection | UploadAcceptance;

/**
 * Whether a file may be uploaded, and what to tell the user if not.
 *
 * The messages say what happened, what the limit is, and what to do about it —
 * an estimator who has just waited on a large file needs to know whether to
 * split the set or convert the file, not that validation failed.
 */
export function checkPdfUpload({
  filename,
  byteSize,
}: {
  filename: string;
  byteSize: number;
}): UploadCheck {
  if (byteSize <= 0) {
    return {
      ok: false,
      message: `${filename} is empty — there is nothing to attach.`,
    };
  }

  if (byteSize > MAX_PDF_BYTES) {
    return {
      ok: false,
      message:
        `${filename} is ${formatBytes(byteSize)}, over the ${formatBytes(MAX_PDF_BYTES)} limit. ` +
        `Split the sheet set and attach it in parts, or export it at a lower resolution.`,
    };
  }

  if (!filename.toLowerCase().endsWith(".pdf")) {
    return {
      ok: false,
      message: `${filename} is not a PDF. Plans have to be PDFs — export one from your viewer and try again.`,
    };
  }

  return { ok: true };
}

/**
 * Whether these opening bytes belong to a PDF.
 *
 * Checked because a file renamed to .pdf passes every other test and then
 * fails to open with nothing explaining why. Runs in the browser now that the
 * bytes go straight to storage and never reach the server — see the router.
 */
export function looksLikePdf(firstBytes: Uint8Array): boolean {
  if (firstBytes.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (firstBytes[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}
