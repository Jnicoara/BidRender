/**
 * Remembering an interrupted upload well enough to continue it — and refusing
 * to continue one that should not be.
 *
 * ── The failure being guarded against ────────────────────────────────────────
 * Offering to resume the wrong thing does not produce an error. It produces a
 * finished PDF assembled from two different files, which attaches, appears in
 * the sheet list, and is rubbish. So most of what follows is about when the
 * store says NO.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  findResumableUpload,
  forgetUpload,
  listResumableUploads,
  rememberUpload,
  type ResumableUpload,
} from "./uploadResumeStore";

/** A localStorage that works, for a node test environment that has none. */
function installStorage(broken = false) {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => {
      if (broken) throw new Error("storage disabled");
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error("storage full");
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  return data;
}

const FILE = {
  name: "Scanned set.pdf",
  size: 900 * 1024 * 1024,
  lastModified: 1700,
};

const record = (over: Partial<ResumableUpload> = {}): ResumableUpload => ({
  bidId: 42,
  storageKey: "bid-plans/1/42/Scanned set_abc12345.pdf",
  uploadId: "upload-1",
  file: { ...FILE },
  partSize: 16 * 1024 * 1024,
  startedAt: 1_000_000,
  ...over,
});

beforeEach(() => {
  installStorage();
});

describe("continuing an upload", () => {
  it("finds the record for the same file on the same bid", () => {
    rememberUpload(record(), 1_000_000);
    const found = findResumableUpload(42, FILE, 1_000_000);
    expect(found?.uploadId).toBe("upload-1");
  });

  it("offers nothing when there is nothing to continue", () => {
    expect(findResumableUpload(42, FILE, 1_000_000)).toBeNull();
  });

  it("forgets a record once its upload has finished", () => {
    rememberUpload(record(), 1_000_000);
    forgetUpload(record().storageKey);
    expect(findResumableUpload(42, FILE, 1_000_000)).toBeNull();
  });

  it("keeps records for several uploads at once", () => {
    rememberUpload(record(), 1_000_000);
    rememberUpload(
      record({ storageKey: "other", uploadId: "upload-2", bidId: 43 }),
      1_000_000
    );
    expect(listResumableUploads(1_000_000)).toHaveLength(2);
  });

  it("replaces the record for a key rather than stacking duplicates", () => {
    rememberUpload(record(), 1_000_000);
    rememberUpload(record({ uploadId: "upload-restarted" }), 1_000_000);
    const all = listResumableUploads(1_000_000);
    expect(all).toHaveLength(1);
    expect(all[0].uploadId).toBe("upload-restarted");
  });
});

describe("refusing to continue the wrong thing", () => {
  /**
   * The expensive mistake: the estimator re-exports the drawing set, picks the
   * new file, and its bytes are stitched onto the old file's pieces.
   */
  it("refuses a re-exported version of the same drawing set", () => {
    rememberUpload(record(), 1_000_000);
    expect(
      findResumableUpload(42, { ...FILE, lastModified: 9999 }, 1_000_000)
    ).toBeNull();
    expect(
      findResumableUpload(42, { ...FILE, size: FILE.size + 1 }, 1_000_000)
    ).toBeNull();
  });

  it("refuses a file with a different name", () => {
    rememberUpload(record(), 1_000_000);
    expect(
      findResumableUpload(42, { ...FILE, name: "Other.pdf" }, 1_000_000)
    ).toBeNull();
  });

  /**
   * The same drawing set legitimately gets attached to two bids. Resuming one
   * into the other would put a plan on a job it does not belong to.
   */
  it("refuses the same file on a different bid", () => {
    rememberUpload(record(), 1_000_000);
    expect(findResumableUpload(99, FILE, 1_000_000)).toBeNull();
  });

  /**
   * The bucket throws abandoned pieces away after seven days. Offering to
   * resume after that would start from zero while saying it was continuing,
   * which is the one thing a resume feature must never do.
   */
  it("stops offering a record older than the bucket keeps the pieces", () => {
    rememberUpload(record({ startedAt: 0 }), 0);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(findResumableUpload(42, FILE, sevenDays)).toBeNull();
  });

  it("still offers one from a few days ago", () => {
    rememberUpload(record({ startedAt: 0 }), 0);
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    expect(findResumableUpload(42, FILE, twoDays)?.uploadId).toBe("upload-1");
  });
});

describe("when the browser will not store anything", () => {
  /**
   * Private windows, full quota, disabled site data. Not being able to REMEMBER
   * an upload costs a resume; it must never cost the upload itself.
   */
  it("reports nothing to resume rather than throwing", () => {
    installStorage(true);
    expect(() => findResumableUpload(42, FILE, 1_000_000)).not.toThrow();
    expect(findResumableUpload(42, FILE, 1_000_000)).toBeNull();
  });

  it("lets a record be written away into nothing without failing", () => {
    installStorage(true);
    expect(() => rememberUpload(record())).not.toThrow();
  });

  it("survives junk under its key", () => {
    const data = installStorage();
    data.set("helixbid:plan-upload-resume", "not json at all");
    expect(findResumableUpload(42, FILE, 1_000_000)).toBeNull();
  });
});
