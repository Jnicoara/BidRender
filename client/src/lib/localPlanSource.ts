/**
 * Gap 6.1 — open a plan from the file on THIS machine while it uploads
 * (references/track-b-plans-screen-gaps-plan.md § Gap 6, item 1).
 *
 * Measured on staging, 2026-10-07 (52.6 MB, 15 pages): the PUT to storage is
 * 11.5–16.4 s of a 16–22 s wait to sheet 1, and then the viewer read the same
 * bytes back DOWN from storage. The file is already on this machine; reading
 * it from disk shows sheet 1 in about 2 s and downloads nothing.
 *
 * ── The source, decided here ─────────────────────────────────────────────────
 *   • While the FIRST plan set of a bid uploads, the viewer shows it from the
 *     file (a preview: nothing can be marked, there are no sheet rows yet).
 *     Only the first: on a bid that already has a plan open, somebody may be
 *     working on it, and pulling the view away for the length of an upload is
 *     worse than the wait it saves. They still get the second half below.
 *   • Once attached, the set keeps reading from the file for the rest of this
 *     visit — every set uploaded here, first or not. A stored link is only
 *     needed by a tab that never had the file.
 *
 * ── The key must not change at attach ────────────────────────────────────────
 * The viewer reloads the document when its source key changes, and a reload
 * blanks the sheet ("Opening plan set…"). So the preview and the attached set
 * share ONE key, minted when the upload starts, and the stored link a refetch
 * brings cannot replace the file either — the same rule as `viewerUrlWindow`:
 * the source must not change under an open plan.
 */

/** The file a set is read from on this visit, and the key it opened under. */
export type LocalPlan = { file: Blob; key: string };

/** A set uploading right now, shown from its file before it has a row. */
export type UploadPreview = LocalPlan & { filename: string };

/** What the viewer needs to know about a plan set. */
export type PlanSourceDoc = {
  id: number;
  filename: string;
  byteSize: number;
  pageCount: number | null;
  url: string;
};

export type PaneSource = {
  doc: PlanSourceDoc;
  /** Read the document from here instead of `doc.url`, when set. */
  localFile: Blob | null;
  /** The viewer's document key; it reloads only when this changes. */
  sourceKey: string;
  /** True for an upload with no row yet: nothing may be marked on it. */
  preview: boolean;
};

/**
 * What the sheet list and the work pane say while a preview is open — in
 * place of "Sheets appear once the document opens" (it IS open) and "pick
 * something from Count in the toolbar" (there is no toolbar yet).
 */
export const UPLOAD_PREVIEW_NOTE =
  "Sheet 1 is open from your computer while this set uploads. The other sheets, and counting, are ready once it is saved.";

/** The id a preview carries: never a real row's. */
export const PREVIEW_DOC_ID = -1;

/** One key per upload, never reused within a visit. */
export function localPlanKey(jobId: string | number): string {
  return `local:${jobId}`;
}

export function paneSource(
  doc: PlanSourceDoc | null,
  locals: ReadonlyMap<number, LocalPlan>,
  preview: UploadPreview | null
): PaneSource | null {
  if (doc) {
    const local = locals.get(doc.id);
    return {
      doc,
      localFile: local?.file ?? null,
      sourceKey: local?.key ?? String(doc.id),
      preview: false,
    };
  }
  if (preview)
    return {
      doc: {
        id: PREVIEW_DOC_ID,
        filename: preview.filename,
        byteSize: preview.file.size,
        pageCount: null,
        url: "",
      },
      localFile: preview.file,
      sourceKey: preview.key,
      preview: true,
    };
  return null;
}

/**
 * Whether a starting upload is shown as a preview: only when no plan set is
 * open on this bid (see "The source, decided here").
 */
export function previewsUpload(openDocId: number | null): boolean {
  return openDocId === null;
}

/**
 * The bytes pdf.js asks for, read from the file. `end` is exclusive, as in
 * pdf.js's own `requestDataRange(begin, end)` and `Blob.slice`.
 */
export async function readFileRange(
  file: Blob,
  begin: number,
  end: number
): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(begin, end).arrayBuffer());
}
