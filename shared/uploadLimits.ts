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
 * ── Why 2GB ──────────────────────────────────────────────────────────────────
 * The number tracks what a real plan set weighs, not what feels tidy.
 *
 *   Vector set, 100 sheets, architectural + MEP      20 – 80MB
 *   SCANNED set, 300dpi colour, same size            200 – 600MB
 *   Big commercial package with addenda              can pass 500MB
 *
 * Scanned sets are the case that matters. They are what an estimator receives
 * from a general contractor who printed and re-scanned the drawings, they are
 * the single most common large file in this trade, and each previous ceiling in
 * turn — 30MB, then 150MB, then 500MB — turned a good number of them away.
 *
 * It also sits sensibly against comparable tools, which is the check on whether
 * a number is realistic or merely generous: Procore and Autodesk Construction
 * Cloud accept multi-gigabyte files, Bluebeam Studio and PlanGrid land around
 * 1GB per document, and the takeoff-focused tools sit in the mid hundreds of
 * megabytes. 2GB puts BidRender at the top of that range rather than the bottom,
 * without pretending to be a document management system.
 *
 * ── And why not "no limit" ───────────────────────────────────────────────────
 * An unbounded upload is a way to fill a bucket by accident or on purpose, and
 * there is no honest error to show once it has happened. A bound that is
 * generous and enforced beats no bound.
 *
 * ── The limit is not the only ceiling, and never was ─────────────────────────
 * Raising this number alone moves a figure on screen. It did before: the
 * 30MB → 150MB change had to route the bytes around a 32 MiB platform request
 * limit before the new number meant anything (see bidPdfsRouter's header). Two
 * ceilings used to sit above this one, and 2GB is only real because both have
 * now been dealt with:
 *
 *   • the TRANSPORT — a file this size is sent to R2 in pieces, several at a
 *     time, resuming after an interruption rather than starting again. One
 *     unbroken PUT of 2GB would be a bet on twenty uninterrupted minutes. See
 *     shared/multipartPlan.ts and client/src/lib/multipartUpload.ts.
 *   • the VIEWER — pdf.js is given a signed storage url and fetches byte
 *     ranges from it, so only the page on screen is resident rather than the
 *     whole document, and above 50MB it no longer downloads the rest in the
 *     background either. See shared/pdfRangeLoading.ts.
 *
 * Both only apply on the R2 backend. On the Manus proxy or a local folder the
 * app still works, but a file near this limit is a much worse experience, which
 * is the honest reason the number is not raised further.
 */

/** Largest plan PDF the app accepts. */
export const MAX_PDF_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Above this, the first open may visibly take a moment.
 *
 * ── What this used to mean, and why it changed ───────────────────────────────
 * It used to be 150MB and the warning said a set that large "may not render on
 * a low-memory device". That was true when the viewer read the entire document
 * into an ArrayBuffer before pdf.js saw it. It is not true any more: the viewer
 * holds a page at a time, so memory stopped being the constraint.
 *
 * A warning that has stopped being true is worse than no warning, because it
 * teaches people that this app's warnings can be ignored. So the number moved
 * to where a real effect starts — a set of this size has a cross-reference
 * table big enough that the first open is perceptibly slower — and the wording
 * lost the part about crashing, which no longer happens.
 */
export const VIEWER_COMFORTABLE_BYTES = 750 * 1024 * 1024;

/** Human-readable size, matching how the UI prints every other file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  // Gigabytes once a figure would otherwise run to four digits. "2GB" is what
  // the limit is called out loud; "2048MB" is the same number said badly.
  if (mb >= 1024) {
    const gb = mb / 1024;
    return Number.isInteger(gb) ? `${gb}GB` : `${gb.toFixed(1)}GB`;
  }
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
