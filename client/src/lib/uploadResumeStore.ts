/**
 * Remembering an upload that did not finish, so it can be picked up again.
 *
 * ── What is remembered, and what deliberately is not ─────────────────────────
 * Only the things that cannot be discovered again: the storage key, the upload
 * id, and enough about the file to recognise it (name, size, modified time).
 *
 * WHICH PIECES ARRIVED IS NOT REMEMBERED. R2 knows that, and R2 was actually
 * there. A local note of "pieces I believe I sent" is wrong in exactly the case
 * this feature exists for — the connection died mid-piece — and acting on a
 * wrong note produces a file that completes and is corrupt. A corrupt plan set
 * is worse than a failed upload, because nothing tells anyone it happened.
 *
 * ── Why localStorage ─────────────────────────────────────────────────────────
 * It has to survive the tab closing, which rules out memory, and it is a few
 * hundred bytes per upload, which does not warrant IndexedDB. Every read and
 * write is wrapped: storage can be full, disabled, or throw in a private
 * window, and none of that may stop an upload from starting.
 *
 * ── Why it cannot hold the file itself ───────────────────────────────────────
 * A page that reloads loses its handle on a chosen file and the browser will
 * not give it back without the user choosing again. That is a deliberate
 * browser rule, not an oversight, so resuming after a reload always involves
 * picking the file again. This record is what makes that second pick continue
 * an upload rather than start a new one.
 */
import {
  fileIdentity,
  sameFile,
  type FileIdentity,
} from "@shared/multipartPlan";

const KEY = "helixbid:plan-upload-resume";

/**
 * How long an unfinished upload stays offerable.
 *
 * Six days, deliberately inside the bucket's seven-day rule for clearing
 * abandoned pieces. Offering to resume an upload whose pieces storage has
 * already thrown away would start from zero while saying it was continuing,
 * which is the one thing a resume feature must never do.
 */
const RESUME_TTL_MS = 6 * 24 * 60 * 60 * 1000;

export type ResumableUpload = {
  bidId: number;
  storageKey: string;
  uploadId: string;
  file: FileIdentity;
  partSize: number;
  /** When it was started, for expiry. Milliseconds. */
  startedAt: number;
};

function readAll(): ResumableUpload[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ResumableUpload[]) : [];
  } catch {
    // Unreadable, full, disabled, or someone else's data under our key. An
    // upload must still be able to start, so this is "nothing remembered".
    return [];
  }
}

function writeAll(records: ResumableUpload[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // Not being able to remember costs a resume. It must not cost the upload.
  }
}

/** Drop anything past its usefulness. Called on every read. */
function fresh(records: ResumableUpload[], now: number): ResumableUpload[] {
  return records.filter(r => now - r.startedAt < RESUME_TTL_MS);
}

/**
 * `now` is a parameter here for the same reason it is on the reads: this
 * function PRUNES, so a hidden clock would make "what is remembered" depend on
 * when the test ran. Everything in this module that consults the clock takes
 * it, and nothing in it calls `Date.now()` behind the caller's back.
 */
export function rememberUpload(
  record: ResumableUpload,
  now: number = Date.now()
): void {
  const kept = fresh(readAll(), now).filter(
    r => r.storageKey !== record.storageKey
  );
  writeAll([...kept, record]);
}

export function forgetUpload(storageKey: string): void {
  writeAll(readAll().filter(r => r.storageKey !== storageKey));
}

/**
 * An unfinished upload of THIS file on THIS bid, if there is one.
 *
 * Matched on the bid as well as the file, so the same drawing set attached to
 * two different bids does not resume one into the other.
 */
export function findResumableUpload(
  bidId: number,
  file: { name: string; size: number; lastModified: number },
  now: number = Date.now()
): ResumableUpload | null {
  const identity = fileIdentity(file);
  const match = fresh(readAll(), now).find(
    r => r.bidId === bidId && sameFile(r.file, identity)
  );
  return match ?? null;
}

/** Everything still offerable. Exposed for tests and for tidying up. */
export function listResumableUploads(
  now: number = Date.now()
): ResumableUpload[] {
  return fresh(readAll(), now);
}
