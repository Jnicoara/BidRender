/**
 * Deleting a row that names a stored file, and then the file.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * Until 2026-09-27 deleting a bid removed its database rows and nothing else:
 * the plan PDFs stayed in R2 or on disk with nothing pointing at them, while
 * the archive told the contractor the plans went with the bid. These are
 * customer drawings. Every path that deletes a row naming a stored file now
 * comes through here, and `server/storedFiles.test.ts` fails if a new one
 * calls the raw `db` delete directly.
 *
 * ── Rows first, then files ───────────────────────────────────────────────────
 * The keys are read, the rows are deleted, and only then are the files
 * released. The other order fails the wrong way: a file deleted before a row
 * delete that then fails leaves a bid pointing at a drawing that is gone. This
 * way a failure leaves a file nothing names — which is exactly what
 * `scripts/sweepOrphanPlans.mts` finds and clears. Failure points at "keeps
 * too much", never "deletes too early" (CLAUDE.md § Scheduled work).
 *
 * ── Only a file NOTHING names ────────────────────────────────────────────────
 * Two rows can name one object, so a key is deleted only when no row in any
 * account still names it (`db.storageKeysInUse`).
 */
import * as db from "./db";
import { storageDelete } from "./storage";

export type ReleaseResult = {
  /** Deleted from every store a read could reach. */
  deleted: number;
  /** Still named by another row, so left alone. */
  stillNamed: number;
  /** A store refused. Left for the sweep; logged without the url. */
  failed: number;
};

/**
 * Delete each file no row names any more.
 *
 * Never throws for a storage failure. The rows are already gone by the time
 * this runs, and an error here would report a delete that DID happen as one
 * that failed. The file is logged by key and left for the sweep.
 */
export async function releaseStoredFiles(
  keys: readonly (string | null | undefined)[]
): Promise<ReleaseResult> {
  const unique = Array.from(
    new Set(
      keys
        .filter((k): k is string => typeof k === "string" && k.trim() !== "")
        .map(k => k.replace(/^\/+/, ""))
    )
  );
  const result: ReleaseResult = { deleted: 0, stillNamed: 0, failed: 0 };
  if (unique.length === 0) return result;

  let inUse: Set<string>;
  try {
    inUse = await db.storageKeysInUse(unique);
  } catch (error) {
    // Cannot tell what is still named, so delete nothing.
    console.error("[storedFiles] could not check keys in use:", error);
    result.failed = unique.length;
    return result;
  }

  for (const key of unique) {
    if (inUse.has(key)) {
      result.stillNamed++;
      continue;
    }
    try {
      await storageDelete(key);
      result.deleted++;
    } catch (error) {
      result.failed++;
      console.error(`[storedFiles] could not delete ${key}:`, error);
    }
  }
  return result;
}

/** Delete a bid for good, then its plan files. Every permanent delete. */
export async function deleteBidWithFiles(
  bidId: number,
  userId: number
): Promise<ReleaseResult> {
  const keys = await db.getBidStorageKeys(bidId, userId);
  await db.deleteBidForever(bidId, userId);
  return releaseStoredFiles(keys);
}

/** Remove the sample bid, then any plan somebody attached to it. */
export async function removeSampleWithFiles(
  bidId: number,
  userId: number
): Promise<ReleaseResult> {
  const keys = await db.getBidStorageKeys(bidId, userId);
  await db.removeSampleProject(bidId, userId);
  // removeSampleProject declines a bid that is not a sample; then nothing
  // was deleted and every key is still named, so nothing is released.
  return releaseStoredFiles(keys);
}

/** Remove one plan set from a bid, then its file. */
export async function deleteBidPdfWithFile(
  bidPdfId: number,
  userId: number
): Promise<ReleaseResult> {
  const pdf = await db.getBidPdf(bidPdfId, userId);
  await db.deleteBidPdf(bidPdfId, userId);
  return releaseStoredFiles([pdf?.storageKey]);
}

/** Delete a legacy project, then the one PDF it may hold. */
export async function deleteProjectWithFile(
  projectId: number,
  userId: number
): Promise<ReleaseResult> {
  const project = await db.getProjectById(projectId, userId);
  await db.deleteProject(projectId, userId);
  return releaseStoredFiles([project?.pdfKey]);
}

/**
 * Point the letterhead at a new logo, or at none, then drop the old file.
 * Replacing or clearing a logo used to leave the previous one in storage.
 */
export async function setLogoReleasingOld(
  userId: number,
  next: { logoKey: string | null; logoUrl: string | null }
): Promise<ReleaseResult> {
  const before = await db.getCompanyBranding(userId);
  await db.updateCompanyBranding(userId, next);
  const old = before?.logoKey ?? null;
  return releaseStoredFiles(old && old !== next.logoKey ? [old] : []);
}

/**
 * Record a new legacy project PDF, then drop the one it replaces.
 * Re-uploading used to overwrite the column and keep the old object.
 */
export async function setProjectPdfReleasingOld(
  projectId: number,
  userId: number,
  next: { pdfUrl: string; pdfKey: string; pdfFilename: string }
): Promise<ReleaseResult> {
  const before = await db.getProjectById(projectId, userId);
  await db.updateProject(
    projectId,
    userId,
    next as Parameters<typeof db.updateProject>[2]
  );
  const old = before?.pdfKey ?? null;
  return releaseStoredFiles(old && old !== next.pdfKey ? [old] : []);
}
